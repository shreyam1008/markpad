package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"runtime/debug"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"markpad/internal/brand"
	"markpad/internal/session"
	"markpad/internal/workspace"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx           context.Context
	store         *session.Store
	sess          *session.Session
	pendingFiles  []string
	contentMu     sync.Mutex
	quitConfirmed atomic.Bool

	workspaceMu           sync.Mutex
	workspaceState        workspace.State
	workspaceSearchCancel context.CancelFunc
	workspaceSearchID     uint64
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	store, err := session.NewStore(brand.StorageName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "session store: %v\n", err)
		return
	}
	a.store = store
	sess, err := store.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "session load: %v\n", err)
		return
	}
	a.sess = sess
	if recoveryPath := store.RecoveredSessionPath(); recoveryPath != "" {
		message := fmt.Sprintf("%s could not read the previous session and started a clean one. The unreadable session was preserved at:\n\n%s", brand.ProductName, recoveryPath)
		fmt.Fprintln(os.Stderr, message)
		go func() {
			_, dialogErr := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
				Type: runtime.WarningDialog, Title: "Session recovery", Message: message, Buttons: []string{"OK"},
			})
			a.recordBackgroundError("show session recovery notice", dialogErr)
		}()
	}
	if sess.WorkspaceRoot != "" {
		state, scanErr := workspace.Scan(sess.WorkspaceRoot)
		if scanErr != nil {
			fmt.Fprintf(os.Stderr, "workspace load: %v\n", scanErr)
		} else {
			a.workspaceState = state
		}
	}

	// Open any files passed on command line
	if len(a.pendingFiles) > 0 {
		for _, f := range a.pendingFiles {
			a.openPath(f)
		}
		a.pendingFiles = nil
	}
}

func (a *App) onSecondInstanceLaunch(data options.SecondInstanceData) {
	// Open files from second instance args
	for _, arg := range data.Args {
		if !strings.HasPrefix(arg, "-") && arg != "" {
			abs, err := filepath.Abs(arg)
			if err == nil {
				arg = abs
			}
			a.openPath(arg)
		}
	}
	// Bring window to front
	runtime.WindowUnminimise(a.ctx)
	runtime.Show(a.ctx)
	go runtime.EventsEmit(a.ctx, "secondInstance")
}

func (a *App) shutdown(ctx context.Context) {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	a.workspaceMu.Lock()
	if a.workspaceSearchCancel != nil {
		a.workspaceSearchCancel()
		a.workspaceSearchCancel = nil
	}
	a.workspaceMu.Unlock()
	if a.store != nil && a.sess != nil {
		a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	}
}

func (a *App) beforeClose(ctx context.Context) bool {
	if a.quitConfirmed.Load() {
		return false
	}
	dirty := a.unsavedDocumentCount()
	if dirty == 0 {
		return false
	}
	runtime.EventsEmit(ctx, "app:quit-requested", dirty)
	return true
}

func (a *App) unsavedDocumentCount() int {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	if a.sess == nil {
		return 0
	}
	dirty := 0
	for _, doc := range a.sess.Documents {
		if doc != nil && doc.Dirty {
			// Skip prompting for empty drafts or unmodified default drafts
			if doc.Path == "" && a.store != nil {
				content, err := a.store.ReadDraft(doc)
				if err == nil && session.IsDefaultDraftContent(content) {
					continue
				}
			}
			dirty++
		}
	}
	return dirty
}

func (a *App) QuitWithoutSaving() {
	a.quitConfirmed.Store(true)
	runtime.Quit(a.ctx)
}

// ---------- Types returned to frontend ----------

type NoteInfo struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Path      string `json:"path"`
	Dirty     bool   `json:"dirty"`
	Star      bool   `json:"star"`
	Kind      string `json:"kind"`
	ViewMode  string `json:"viewMode"`
	Size      int64  `json:"size"`
	ScrollTop int    `json:"scrollTop"`
	ViewTop   int    `json:"viewTop"`
	Cursor    int    `json:"cursor"`
}

type RecentInfo struct {
	Path    string `json:"path"`
	Title   string `json:"title"`
	Kind    string `json:"kind"`
	Missing bool   `json:"missing"`
}

type SessionState struct {
	ActiveID  string       `json:"activeId"`
	Notes     []NoteInfo   `json:"notes"`
	Favorites []NoteInfo   `json:"favorites"`
	Recents   []RecentInfo `json:"recents"`
}

type SaveConflictInfo struct {
	Kind     string `json:"kind"`
	Path     string `json:"path"`
	Modified string `json:"modified"`
}

type SaveResult struct {
	Session  SessionState      `json:"session"`
	Conflict *SaveConflictInfo `json:"conflict,omitempty"`
}

type WorkspaceFile struct {
	Path     string `json:"path"`
	Relative string `json:"relative"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

type WorkspaceState struct {
	Root      string          `json:"root"`
	Name      string          `json:"name"`
	Files     []WorkspaceFile `json:"files"`
	Truncated bool            `json:"truncated"`
}

type WorkspaceSearchResult struct {
	Path       string `json:"path"`
	Relative   string `json:"relative"`
	Line       int    `json:"line"`
	Column     int    `json:"column"`
	Text       string `json:"text"`
	MatchStart int    `json:"matchStart"`
	MatchEnd   int    `json:"matchEnd"`
}

// ---------- Session methods ----------

func (a *App) GetSession() SessionState {
	state := SessionState{
		Notes:     []NoteInfo{},
		Favorites: []NoteInfo{},
		Recents:   []RecentInfo{},
	}
	if a.sess == nil {
		return state
	}
	state.ActiveID = a.sess.ActiveID
	for _, doc := range a.sess.Documents {
		kind, size := fileKindAndSize(doc.Path)
		if doc.Path == "" {
			kind = draftKind(doc.Format)
		}
		state.Notes = append(state.Notes, NoteInfo{
			ID:        doc.ID,
			Title:     doc.Title,
			Path:      doc.Path,
			Dirty:     doc.Dirty,
			Star:      a.sess.IsBookmarked(doc.Path),
			Kind:      kind,
			ViewMode:  doc.ViewMode,
			Size:      size,
			ScrollTop: doc.ScrollTop,
			ViewTop:   doc.ViewTop,
			Cursor:    doc.Cursor,
		})
	}
	for _, bm := range a.sess.Bookmarks {
		kind, size := fileKindAndSize(bm.Path)
		state.Favorites = append(state.Favorites, NoteInfo{
			ID:    bm.ID,
			Title: bm.Title,
			Path:  bm.Path,
			Star:  true,
			Kind:  kind,
			Size:  size,
		})
	}
	for _, r := range a.sess.RecentFiles {
		kind, _ := fileKindAndSize(r.Path)
		_, err := os.Stat(r.Path)
		state.Recents = append(state.Recents, RecentInfo{Path: r.Path, Title: r.Title, Kind: kind, Missing: err != nil})
	}
	return state
}

func (a *App) GetActiveContent() string {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	doc := a.sess.Active()
	if doc == nil {
		return ""
	}
	content, err := a.store.ReadDraft(doc)
	if err != nil {
		return ""
	}
	return content
}

func (a *App) GetNoteContent(id string) string {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	doc := a.sess.Find(id)
	if doc == nil {
		return ""
	}
	content, err := a.store.ReadDraft(doc)
	if err != nil {
		return ""
	}
	return content
}

func (a *App) SetActive(id string) {
	if a.sess.Find(id) != nil {
		a.sess.ActiveID = id
		a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	}
}

func (a *App) SetViewMode(id string, mode string) {
	if mode != "markdown" && mode != "split" && mode != "viewer" {
		return
	}
	doc := a.sess.Find(id)
	if doc == nil || doc.ViewMode == mode {
		return
	}
	a.sess.RememberViewMode(doc, mode)
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
}

func (a *App) UpdateReadPosition(id string, scrollTop int, viewTop int, cursor int) {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	doc := a.sess.Find(id)
	if doc == nil {
		return
	}
	doc.ScrollTop = scrollTop
	doc.ViewTop = viewTop
	doc.Cursor = cursor
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
}

func (a *App) NewNote() SessionState {
	return a.NewNoteOfType("md")
}

func (a *App) NewNoteOfType(format string) SessionState {
	format = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(format)), ".")
	allowed := map[string]bool{"md": true, "txt": true, "json": true, "yaml": true}
	if !allowed[format] {
		format = "md"
	}
	doc := session.NewDocument("", "")
	doc.Format = format
	doc.Title = "Untitled." + format
	a.sess.Add(doc)
	a.recordBackgroundError("session persistence", a.store.WriteDraft(doc, ""))
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	runtime.WindowSetTitle(a.ctx, brand.WindowTitle(doc.Title))
	return a.GetSession()
}

func (a *App) UpdateContent(id string, content string, dirty bool) {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	doc := a.sess.Find(id)
	if doc == nil {
		return
	}
	if isReadOnlyPath(doc.Path) {
		return
	}
	doc.Dirty = dirty
	doc.UpdatedAt = time.Now()
	if doc.Path == "" {
		doc.Title = session.TitleFromContent(content, "")
	}
	a.recordBackgroundError("session persistence", a.store.WriteDraft(doc, content))
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
}

func (a *App) MarkDirty(id string) {
	if doc := a.sess.Find(id); doc != nil && !isReadOnlyPath(doc.Path) {
		doc.Dirty = true
	}
}

func (a *App) RevertContent(id string, content string, dirty bool) SessionState {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	doc := a.sess.Find(id)
	if doc == nil || isReadOnlyPath(doc.Path) {
		return a.GetSession()
	}
	doc.Dirty = dirty
	doc.UpdatedAt = time.Now()
	if doc.Path == "" {
		doc.Title = session.TitleFromContent(content, "")
	}
	a.recordBackgroundError("session persistence", a.store.WriteDraft(doc, content))
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	return a.GetSession()
}

func (a *App) SaveActive(content string, overwrite bool) (SaveResult, error) {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	doc := a.sess.Active()
	if doc == nil {
		return SaveResult{Session: a.GetSession()}, fmt.Errorf("no active note")
	}
	if doc.Path == "" {
		state, err := a.saveAsDialogLocked(content)
		return SaveResult{Session: state}, err
	}
	if isReadOnlyPath(doc.Path) {
		return SaveResult{Session: a.GetSession()}, fmt.Errorf("read-only document: open externally to edit")
	}
	var err error
	if overwrite {
		err = a.store.OverwriteToDisk(doc, content)
	} else {
		err = a.store.SaveToDisk(doc, content)
	}
	if err != nil {
		var changed *session.ExternalChangeError
		if !errors.As(err, &changed) {
			return SaveResult{Session: a.GetSession()}, err
		}
		doc.Dirty = true
		doc.UpdatedAt = time.Now()
		if draftErr := a.store.WriteDraft(doc, content); draftErr != nil {
			return SaveResult{Session: a.GetSession()}, fmt.Errorf("preserve conflicted draft: %w", draftErr)
		}
		if persistErr := a.store.Save(a.sess); persistErr != nil {
			return SaveResult{Session: a.GetSession()}, fmt.Errorf("persist conflicted draft: %w", persistErr)
		}
		modified := ""
		if changed.Current != nil && !changed.Current.ModifiedAt.IsZero() {
			modified = changed.Current.ModifiedAt.Format(time.RFC3339Nano)
		}
		return SaveResult{
			Session: a.GetSession(),
			Conflict: &SaveConflictInfo{
				Kind:     string(changed.Kind),
				Path:     changed.Path,
				Modified: modified,
			},
		}, nil
	}
	a.recordBackgroundError("session persistence", a.store.SaveSnapshot(doc.ID, content, "save"))
	if err := a.store.Save(a.sess); err != nil {
		return SaveResult{Session: a.GetSession()}, err
	}
	a.refreshWindowTitle()
	if overwrite {
		a.refreshWorkspaceAfterConflict()
	}
	return SaveResult{Session: a.GetSession()}, nil
}

// ReloadActiveFromDisk is an explicit conflict resolution. The Quillpane draft
// is saved in history before the disk version becomes the clean recovery copy.
func (a *App) ReloadActiveFromDisk(markpadContent string) (SessionState, error) {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	doc := a.sess.Active()
	if doc == nil || doc.Path == "" {
		return a.GetSession(), fmt.Errorf("active note has no source file")
	}
	if isReadOnlyPath(doc.Path) {
		return a.GetSession(), fmt.Errorf("read-only document: open externally to reload")
	}
	diskContent, err := readOpenFile(doc.Path)
	if err != nil {
		return a.GetSession(), fmt.Errorf("reload source file: %w", err)
	}
	if looksBinary(diskContent) {
		return a.GetSession(), fmt.Errorf("source file is no longer editable text")
	}

	oldDocument := *doc
	if doc.SourceState != nil {
		oldState := *doc.SourceState
		oldDocument.SourceState = &oldState
	}
	if err := a.store.RefreshSourceState(doc, diskContent); err != nil {
		*doc = oldDocument
		return a.GetSession(), fmt.Errorf("source changed again during reload: %w", err)
	}
	if err := a.store.SaveSnapshot(doc.ID, markpadContent, "before-external-reload"); err != nil {
		*doc = oldDocument
		return a.GetSession(), fmt.Errorf("protect %s draft before reload: %w", brand.ProductName, err)
	}
	if err := a.store.SaveSnapshot(doc.ID, string(diskContent), "external-reload"); err != nil {
		*doc = oldDocument
		return a.GetSession(), fmt.Errorf("record reloaded source: %w", err)
	}
	if err := a.store.WriteDraft(doc, string(diskContent)); err != nil {
		*doc = oldDocument
		return a.GetSession(), fmt.Errorf("store reloaded source: %w", err)
	}

	doc.Dirty = false
	doc.Title = session.TitleFromContent(string(diskContent), doc.Path)
	doc.UpdatedAt = time.Now()
	if doc.SourceState != nil && !doc.SourceState.ModifiedAt.IsZero() {
		doc.SavedAt = doc.SourceState.ModifiedAt
	}
	if err := a.store.Save(a.sess); err != nil {
		*doc = oldDocument
		if draftErr := a.store.WriteDraft(doc, markpadContent); draftErr != nil {
			return a.GetSession(), fmt.Errorf("persist reload: %v; restore %s draft: %w", err, brand.ProductName, draftErr)
		}
		return a.GetSession(), fmt.Errorf("persist reload: %w", err)
	}
	a.refreshWindowTitle()
	a.refreshWorkspaceAfterConflict()
	return a.GetSession(), nil
}

func (a *App) refreshWorkspaceAfterConflict() {
	a.refreshWorkspaceInventory("refresh workspace after conflict")
}

func (a *App) refreshWorkspaceInventory(operation string) {
	a.workspaceMu.Lock()
	root := a.workspaceState.Root
	a.workspaceMu.Unlock()
	if root == "" {
		return
	}
	state, err := workspace.Scan(root)
	if err != nil {
		a.recordBackgroundError(operation, err)
		return
	}
	a.workspaceMu.Lock()
	a.workspaceState = state
	a.workspaceMu.Unlock()
}

func (a *App) SaveAsDialog(content string) (SessionState, error) {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	return a.saveAsDialogLocked(content)
}

func (a *App) saveAsDialogLocked(content string) (SessionState, error) {
	doc := a.sess.Active()
	if doc == nil {
		return a.GetSession(), fmt.Errorf("no active note")
	}
	defaultName := "Untitled." + draftExtension(doc.Format)
	if doc.Path != "" {
		defaultName = filepath.Base(doc.Path)
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save As",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{DisplayName: "All Files", Pattern: "*"},
			{DisplayName: "Markdown", Pattern: "*.md;*.markdown;*.mdx"},
			{DisplayName: "Text", Pattern: "*.txt;*.log"},
		},
	})
	if err != nil {
		return a.GetSession(), err
	}
	if path == "" {
		return a.GetSession(), nil
	}
	if err := a.store.SaveAs(doc, path, content); err != nil {
		return a.GetSession(), err
	}
	a.sess.RememberViewMode(doc, doc.ViewMode)
	a.recordBackgroundError("session persistence", a.store.SaveSnapshot(doc.ID, content, "save-as"))
	if err := a.store.Save(a.sess); err != nil {
		return a.GetSession(), err
	}
	runtime.WindowSetTitle(a.ctx, brand.WindowTitle(doc.Title))
	return a.GetSession(), nil
}

func (a *App) RenameNote(id string, name string) (SessionState, error) {
	doc := a.sess.Find(id)
	if doc == nil || doc.Path == "" {
		return a.GetSession(), fmt.Errorf("save the draft before renaming it")
	}
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." || name != filepath.Base(name) || strings.ContainsAny(name, `/\`) {
		return a.GetSession(), fmt.Errorf("enter a file name, not a path")
	}
	oldPath := doc.Path
	newPath := filepath.Join(filepath.Dir(oldPath), name)
	if filepath.Clean(newPath) == filepath.Clean(oldPath) {
		return a.GetSession(), nil
	}
	if existing := a.sess.FindFile(newPath); existing != nil && existing.ID != doc.ID {
		return a.GetSession(), fmt.Errorf("that file is already open")
	}
	if _, err := os.Stat(newPath); err == nil {
		return a.GetSession(), fmt.Errorf("a file named %q already exists", name)
	} else if !os.IsNotExist(err) {
		return a.GetSession(), err
	}
	if err := os.Rename(oldPath, newPath); err != nil {
		return a.GetSession(), err
	}

	oldTitle, oldFormat := doc.Title, doc.Format
	doc.Path = newPath
	doc.Title = filepath.Base(newPath)
	doc.Format = strings.TrimPrefix(strings.ToLower(filepath.Ext(newPath)), ".")
	replaceSessionPath(a.sess, oldPath, newPath, doc.Title)
	if err := a.store.Save(a.sess); err != nil {
		_ = os.Rename(newPath, oldPath)
		replaceSessionPath(a.sess, newPath, oldPath, oldTitle)
		doc.Path, doc.Title, doc.Format = oldPath, oldTitle, oldFormat
		return a.GetSession(), err
	}
	runtime.WindowSetTitle(a.ctx, brand.WindowTitle(doc.Title))
	return a.GetSession(), nil
}

func (a *App) OpenFileDialog() (SessionState, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open File",
		Filters: []runtime.FileFilter{
			{DisplayName: "All Files", Pattern: "*"},
			{DisplayName: "Markdown", Pattern: "*.md;*.markdown;*.mdx"},
			{DisplayName: "Text & Logs", Pattern: "*.txt;*.log;*.csv;*.tsv;*.env;*.gitignore;*.editorconfig"},
			{DisplayName: "Data & Config", Pattern: "*.json;*.yaml;*.yml;*.xml;*.toml;*.ini;*.cfg;*.conf;*.properties"},
			{DisplayName: "Code", Pattern: "*.py;*.js;*.ts;*.jsx;*.tsx;*.go;*.rs;*.rb;*.lua;*.java;*.c;*.cpp;*.h;*.cs;*.php;*.swift;*.kt;*.dart;*.r;*.sql"},
			{DisplayName: "Shell & Scripts", Pattern: "*.sh;*.bash;*.zsh;*.fish;*.ps1;*.bat;*.cmd"},
			{DisplayName: "Web", Pattern: "*.html;*.htm;*.css;*.scss;*.less;*.svg;*.vue;*.svelte"},
			{DisplayName: "Documents", Pattern: "*.pdf;*.epub;*.mobi;*.azw;*.azw3;*.fb2;*.doc;*.docx;*.odt;*.rtf"},
			{DisplayName: "Images & Archives", Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.zip;*.tar;*.gz;*.7z;*.rar"},
		},
	})
	if err != nil {
		return a.GetSession(), err
	}
	if path == "" {
		return a.GetSession(), nil
	}
	return a.openPath(path)
}

// OpenDroppedFile opens a file by path (used for drag-and-drop from OS).
func (a *App) OpenDroppedFile(path string) (SessionState, error) {
	return a.openPath(path)
}

func (a *App) openPath(path string) (SessionState, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return a.GetSession(), fmt.Errorf("empty path")
	}
	abs, err := filepath.Abs(path)
	if err == nil {
		path = filepath.Clean(abs)
	}
	info, err := os.Stat(path)
	if err != nil {
		return a.GetSession(), err
	}
	if info.IsDir() {
		_, err := a.selectWorkspace(path)
		return a.GetSession(), err
	}
	path = canonicalPath(path)
	if doc := a.sess.FindFile(path); doc != nil {
		a.sess.ActiveID = doc.ID
		a.sess.AddRecent(path)
		if err := a.store.Save(a.sess); err != nil {
			return a.GetSession(), err
		}
		runtime.WindowSetTitle(a.ctx, brand.WindowTitle(doc.Title))
		return a.GetSession(), nil
	}
	if isReadOnlyPath(path) {
		doc := a.sess.AddFile(path, "")
		a.sess.AddRecent(path)
		a.recordBackgroundError("session persistence", a.store.WriteDraft(doc, ""))
		a.recordBackgroundError("session persistence", a.store.Save(a.sess))
		runtime.WindowSetTitle(a.ctx, brand.WindowTitle(doc.Title))
		return a.GetSession(), nil
	}
	data, err := readOpenFile(path)
	if err != nil {
		return a.GetSession(), err
	}
	if looksBinary(data) {
		doc := a.sess.AddFile(path, "")
		a.sess.AddRecent(path)
		a.recordBackgroundError("session persistence", a.store.WriteDraft(doc, ""))
		a.recordBackgroundError("session persistence", a.store.Save(a.sess))
		runtime.WindowSetTitle(a.ctx, brand.WindowTitle(doc.Title))
		return a.GetSession(), nil
	}
	doc := a.sess.AddFile(path, string(data))
	a.sess.AddRecent(path)
	a.recordBackgroundError("session persistence", a.store.WriteDraft(doc, string(data)))
	a.recordBackgroundError("session persistence", a.store.SaveSnapshot(doc.ID, string(data), "open"))
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	runtime.WindowSetTitle(a.ctx, brand.WindowTitle(doc.Title))
	return a.GetSession(), nil
}

// ---------- Folder workspace ----------

func (a *App) GetWorkspace() WorkspaceState {
	a.workspaceMu.Lock()
	defer a.workspaceMu.Unlock()
	return workspaceStateForFrontend(a.workspaceState)
}

func (a *App) ChooseWorkspace() (WorkspaceState, error) {
	defaultDirectory := ""
	if current := a.GetWorkspace(); current.Root != "" {
		defaultDirectory = current.Root
	}
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "Open Folder",
		DefaultDirectory:     defaultDirectory,
		CanCreateDirectories: true,
		ResolvesAliases:      true,
	})
	if err != nil {
		return a.GetWorkspace(), err
	}
	if path == "" {
		return a.GetWorkspace(), nil
	}
	return a.selectWorkspace(path)
}

func (a *App) RefreshWorkspace() (WorkspaceState, error) {
	a.workspaceMu.Lock()
	root := a.workspaceState.Root
	a.workspaceMu.Unlock()
	if root == "" {
		return emptyWorkspaceState(), nil
	}
	return a.selectWorkspace(root)
}

func (a *App) ClearWorkspace() (WorkspaceState, error) {
	a.workspaceMu.Lock()
	if a.workspaceSearchCancel != nil {
		a.workspaceSearchCancel()
		a.workspaceSearchCancel = nil
	}
	a.workspaceSearchID++
	a.workspaceState = workspace.State{}
	a.workspaceMu.Unlock()

	if a.sess != nil {
		a.sess.WorkspaceRoot = ""
		if a.store != nil {
			if err := a.store.Save(a.sess); err != nil {
				return emptyWorkspaceState(), err
			}
		}
	}
	return emptyWorkspaceState(), nil
}

func (a *App) SearchWorkspace(query string) ([]WorkspaceSearchResult, error) {
	a.workspaceMu.Lock()
	state := a.workspaceState
	if a.workspaceSearchCancel != nil {
		a.workspaceSearchCancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.workspaceSearchCancel = cancel
	a.workspaceSearchID++
	requestID := a.workspaceSearchID
	a.workspaceMu.Unlock()
	defer cancel()

	overrides := make(map[string][]byte)
	if a.sess != nil && a.store != nil {
		for _, doc := range a.sess.Documents {
			if !doc.Dirty || doc.Path == "" {
				continue
			}
			path := canonicalPath(doc.Path)
			if path == "" {
				continue
			}
			content, err := a.store.ReadDraft(doc)
			if err != nil || len(content) > workspace.MaxFileSize {
				continue
			}
			overrides[path] = []byte(content)
		}
	}

	results, err := workspace.Search(ctx, state, query, overrides)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return []WorkspaceSearchResult{}, nil
		}
		return nil, err
	}
	a.workspaceMu.Lock()
	stale := requestID != a.workspaceSearchID
	if !stale && a.workspaceSearchCancel != nil {
		a.workspaceSearchCancel = nil
	}
	a.workspaceMu.Unlock()
	if stale {
		return []WorkspaceSearchResult{}, nil
	}

	output := make([]WorkspaceSearchResult, 0, len(results))
	for _, result := range results {
		output = append(output, WorkspaceSearchResult{
			Path:       result.Path,
			Relative:   result.Relative,
			Line:       result.Line,
			Column:     result.Column,
			Text:       result.Text,
			MatchStart: result.MatchStart,
			MatchEnd:   result.MatchEnd,
		})
	}
	return output, nil
}

func (a *App) CreateWorkspaceFile(relativePath string) (SessionState, error) {
	a.workspaceMu.Lock()
	root := a.workspaceState.Root
	a.workspaceMu.Unlock()
	if root == "" {
		return a.GetSession(), fmt.Errorf("open a folder before creating a workspace file")
	}
	path, err := workspace.CreateFile(root, relativePath)
	if err != nil {
		return a.GetSession(), err
	}
	state, err := a.openPath(path)
	if err != nil {
		_ = os.Remove(path)
		return a.GetSession(), err
	}
	if _, err := a.RefreshWorkspace(); err != nil {
		return state, err
	}
	return state, nil
}

// FileDraftInWorkspace promotes the active recovery draft into the selected
// folder without opening a second document or using a broad Save As dialog.
// CreateFile reserves the path first, so an existing note is never replaced.
func (a *App) FileDraftInWorkspace(relativePath string, content string) (SessionState, error) {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	a.workspaceMu.Lock()
	root := a.workspaceState.Root
	a.workspaceMu.Unlock()
	if root == "" {
		return a.GetSession(), fmt.Errorf("open a folder before filing this draft")
	}
	doc := a.sess.Active()
	if doc == nil || doc.Path != "" {
		return a.GetSession(), fmt.Errorf("only an unsaved draft can be filed in the workspace")
	}
	if len(content) > workspace.MaxFileSize {
		return a.GetSession(), fmt.Errorf("draft is too large for Workspace Lite; use Save As instead")
	}

	// Persist the recovery copy before attempting any filesystem mutation.
	doc.Dirty = true
	doc.UpdatedAt = time.Now()
	if err := a.store.WriteDraft(doc, content); err != nil {
		return a.GetSession(), fmt.Errorf("preserve draft before filing: %w", err)
	}
	if err := a.store.Save(a.sess); err != nil {
		return a.GetSession(), fmt.Errorf("persist draft before filing: %w", err)
	}

	path, err := workspace.CreateFile(root, relativePath)
	if err != nil {
		return a.GetSession(), err
	}
	oldDocument := *doc
	if doc.SourceState != nil {
		oldState := *doc.SourceState
		oldDocument.SourceState = &oldState
	}
	if err := a.store.SaveAs(doc, path, content); err != nil {
		*doc = oldDocument
		if removeErr := os.Remove(path); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			return a.GetSession(), fmt.Errorf("file draft: %v; remove incomplete file: %w", err, removeErr)
		}
		return a.GetSession(), fmt.Errorf("file draft: %w", err)
	}
	a.sess.RememberViewMode(doc, doc.ViewMode)
	a.sess.AddRecent(path)
	a.recordBackgroundError("workspace filing history", a.store.SaveSnapshot(doc.ID, content, "file-to-workspace"))
	if err := a.store.Save(a.sess); err != nil {
		return a.GetSession(), fmt.Errorf("workspace file was saved at %s, but session persistence failed: %w", path, err)
	}
	a.refreshWindowTitle()
	a.refreshWorkspaceInventory("refresh workspace after filing draft")
	return a.GetSession(), nil
}

func (a *App) DeleteFile(path string) (SessionState, error) {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	path = strings.TrimSpace(path)
	if path == "" {
		return a.GetSession(), fmt.Errorf("file path is required")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return a.GetSession(), fmt.Errorf("resolve file path: %w", err)
	}
	abs = filepath.Clean(abs)

	a.workspaceMu.Lock()
	root := a.workspaceState.Root
	a.workspaceMu.Unlock()
	workspaceMember := false
	if root != "" {
		if validated, validateErr := workspace.ValidateMember(root, abs); validateErr == nil {
			abs = validated
			workspaceMember = true
		}
	}
	doc := a.sess.FindFile(abs)
	if !workspaceMember && doc == nil {
		return a.GetSession(), fmt.Errorf("file is neither in the open workspace nor an open document")
	}
	validated, err := workspace.ValidateDeleteTarget(abs)
	if err != nil {
		return a.GetSession(), err
	}
	if doc != nil && doc.Path != validated {
		canonicalDoc := canonicalPath(doc.Path)
		if canonicalDoc != validated {
			return a.GetSession(), fmt.Errorf("open document path no longer matches the requested file")
		}
	}
	if err := os.Remove(validated); err != nil {
		return a.GetSession(), fmt.Errorf("delete file: %w", err)
	}

	if doc != nil {
		a.removeDocument(doc, true, true)
	}
	a.removePathReferences(validated)
	a.ensureDocumentExists()
	if err := a.store.Save(a.sess); err != nil {
		return a.GetSession(), fmt.Errorf("persist session after deleting file: %w", err)
	}
	a.refreshWindowTitle()
	if root != "" {
		if _, refreshErr := a.RefreshWorkspace(); refreshErr != nil {
			return a.GetSession(), refreshErr
		}
	}
	return a.GetSession(), nil
}

func (a *App) selectWorkspace(root string) (WorkspaceState, error) {
	state, err := workspace.Scan(root)
	if err != nil {
		return a.GetWorkspace(), err
	}
	a.workspaceMu.Lock()
	if a.workspaceSearchCancel != nil {
		a.workspaceSearchCancel()
		a.workspaceSearchCancel = nil
	}
	a.workspaceSearchID++
	a.workspaceState = state
	a.workspaceMu.Unlock()

	if a.sess != nil {
		a.sess.WorkspaceRoot = state.Root
		if a.store != nil {
			if err := a.store.Save(a.sess); err != nil {
				return workspaceStateForFrontend(state), err
			}
		}
	}
	return workspaceStateForFrontend(state), nil
}

func workspaceStateForFrontend(state workspace.State) WorkspaceState {
	result := WorkspaceState{
		Root:      state.Root,
		Name:      state.Name,
		Files:     make([]WorkspaceFile, 0, len(state.Files)),
		Truncated: state.Truncated,
	}
	for _, file := range state.Files {
		result.Files = append(result.Files, WorkspaceFile{
			Path:     file.Path,
			Relative: file.Relative,
			Name:     file.Name,
			Kind:     file.Kind,
			Size:     file.Size,
			Modified: file.Modified.Format(time.RFC3339Nano),
		})
	}
	return result
}

func emptyWorkspaceState() WorkspaceState {
	return WorkspaceState{Files: []WorkspaceFile{}}
}

func (a *App) GetHistory(id string) []session.HistoryEntry {
	doc := a.sess.Find(id)
	if doc == nil {
		return []session.HistoryEntry{}
	}
	entries, err := a.store.ListHistory(doc.ID)
	if err != nil {
		return []session.HistoryEntry{}
	}
	return entries
}

func (a *App) GetHistoryContent(id string, timestamp string) string {
	doc := a.sess.Find(id)
	if doc == nil {
		return ""
	}
	content, err := a.store.GetSnapshotContent(doc.ID, timestamp)
	if err != nil {
		return ""
	}
	return content
}

func (a *App) RestoreVersion(id string, timestamp string) (SessionState, error) {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	doc := a.sess.Find(id)
	if doc == nil {
		return a.GetSession(), fmt.Errorf("note not found")
	}
	content, err := a.store.GetSnapshotContent(doc.ID, timestamp)
	if err != nil {
		return a.GetSession(), err
	}
	currentContent, err := a.store.ReadDraft(doc)
	if err != nil {
		return a.GetSession(), fmt.Errorf("read current content before restore: %w", err)
	}
	if err := a.store.SaveSnapshot(doc.ID, currentContent, "restore"); err != nil {
		return a.GetSession(), fmt.Errorf("protect current content before restore: %w", err)
	}
	before := *doc
	if doc.SourceState != nil {
		state := *doc.SourceState
		before.SourceState = &state
	}
	if err := a.store.WriteDraft(doc, content); err != nil {
		return a.GetSession(), fmt.Errorf("write restored content: %w", err)
	}
	doc.Dirty = true
	doc.UpdatedAt = time.Now()
	if err := a.store.Save(a.sess); err != nil {
		*doc = before
		if rollbackErr := a.store.WriteDraft(doc, currentContent); rollbackErr != nil {
			return a.GetSession(), fmt.Errorf("save restored session: %w; roll back draft: %v", err, rollbackErr)
		}
		return a.GetSession(), fmt.Errorf("save restored session: %w", err)
	}
	return a.GetSession(), nil
}

func (a *App) ToggleStar(id string) SessionState {
	doc := a.sess.Find(id)
	if doc == nil || doc.Path == "" {
		return a.GetSession()
	}
	content, _ := a.store.ReadDraft(doc)
	a.sess.ToggleBookmark(doc.Path, content)
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	return a.GetSession()
}

func (a *App) OpenPathFromBookmark(path string) (SessionState, error) {
	if strings.TrimSpace(path) == "" {
		return a.GetSession(), nil
	}
	return a.openPath(path)
}

func (a *App) CloseNote(id string) SessionState {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	if strings.TrimSpace(id) == "" || a.sess == nil {
		return a.GetSession()
	}
	doc := a.sess.Find(id)
	if doc == nil || doc.Dirty {
		return a.GetSession()
	}
	a.removeDocument(doc, false, false)
	a.ensureDocumentExists()
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	a.refreshWindowTitle()
	goruntime.GC()
	debug.FreeOSMemory()
	return a.GetSession()
}

func (a *App) RemoveRecent(path string) SessionState {
	filtered := a.sess.RecentFiles[:0]
	for _, recent := range a.sess.RecentFiles {
		if filepath.Clean(recent.Path) != filepath.Clean(path) {
			filtered = append(filtered, recent)
		}
	}
	a.sess.RecentFiles = filtered
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	return a.GetSession()
}

func (a *App) DeleteNote(id string) SessionState {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	target := a.sess.Find(id)
	if target == nil || target.Path != "" {
		return a.GetSession()
	}
	a.removeDocument(target, true, true)
	a.ensureDocumentExists()
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	a.refreshWindowTitle()
	goruntime.GC()
	debug.FreeOSMemory()
	return a.GetSession()
}

// DiscardNote is called after the frontend confirms that unsaved changes may
// be lost. Saved files are preserved; drafts are removed, as is app-owned
// history for an unsaved note that has no disk copy.
func (a *App) DiscardNote(id string) SessionState {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	doc := a.sess.Find(id)
	if doc == nil {
		return a.GetSession()
	}
	if doc.Path == "" {
		a.removeDocument(doc, true, true)
	} else {
		a.removeDocument(doc, true, false)
	}
	a.ensureDocumentExists()
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	a.refreshWindowTitle()
	return a.GetSession()
}

func (a *App) removeDocument(target *session.Document, removeDraft bool, removeHistory bool) {
	if target == nil {
		return
	}
	filtered := make([]*session.Document, 0, max(0, len(a.sess.Documents)-1))
	for _, doc := range a.sess.Documents {
		if doc.ID != target.ID {
			filtered = append(filtered, doc)
		}
	}
	a.sess.Documents = filtered
	if a.sess.ActiveID == target.ID {
		a.sess.ActiveID = ""
		if len(filtered) > 0 {
			a.sess.ActiveID = filtered[0].ID
		}
	}
	if removeDraft {
		a.recordBackgroundError("remove document draft", a.store.RemoveDraft(target))
	}
	if removeHistory {
		a.recordBackgroundError("remove document history", a.store.RemoveHistory(target.ID))
	}
}

func (a *App) removePathReferences(path string) {
	bookmarks := a.sess.Bookmarks[:0]
	for _, bookmark := range a.sess.Bookmarks {
		if canonicalPath(bookmark.Path) != path {
			bookmarks = append(bookmarks, bookmark)
		}
	}
	a.sess.Bookmarks = bookmarks
	recents := a.sess.RecentFiles[:0]
	for _, recent := range a.sess.RecentFiles {
		if canonicalPath(recent.Path) != path {
			recents = append(recents, recent)
		}
	}
	a.sess.RecentFiles = recents
	for viewPath := range a.sess.ViewModes {
		if canonicalPath(viewPath) == path {
			delete(a.sess.ViewModes, viewPath)
		}
	}
}

func (a *App) ensureDocumentExists() {
	if len(a.sess.Documents) > 0 {
		if a.sess.Find(a.sess.ActiveID) == nil {
			a.sess.ActiveID = a.sess.Documents[0].ID
		}
		return
	}
	doc := session.NewDocument("", "")
	doc.Title = "Untitled"
	a.sess.Add(doc)
	a.recordBackgroundError("create fallback draft", a.store.WriteDraft(doc, ""))
}

func (a *App) refreshWindowTitle() {
	if a.ctx == nil || a.sess == nil {
		return
	}
	title := brand.ProductName
	if doc := a.sess.Active(); doc != nil {
		title = brand.WindowTitle(doc.Title)
	}
	runtime.WindowSetTitle(a.ctx, title)
}

// GetFileInfo returns metadata about the active file for the info modal
type FileInfoResult struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Folder   string `json:"folder"`
	Size     int64  `json:"size"`
	Kind     string `json:"kind"`
	Label    string `json:"label"`
	Modified string `json:"modified"`
	ReadOnly bool   `json:"readOnly"`
}

func (a *App) GetFileInfo(id string) FileInfoResult {
	doc := a.sess.Find(id)
	if doc == nil || doc.Path == "" {
		return FileInfoResult{Name: "Untitled", Kind: "markdown", Label: "Markdown"}
	}
	kind, size := fileKindAndSize(doc.Path)
	labels := map[string]string{
		"markdown": "Markdown", "text": "Text", "code": "Code",
		"pdf": "PDF", "ebook": "Ebook", "office": "Office document",
		"image": "Image", "archive": "Archive",
	}
	label := labels[kind]
	if label == "" {
		label = "File"
	}
	modified := ""
	info, err := os.Stat(doc.Path)
	if err == nil {
		modified = info.ModTime().Format("2006-01-02 15:04:05")
	}
	return FileInfoResult{
		Name:     filepath.Base(doc.Path),
		Path:     doc.Path,
		Folder:   filepath.Dir(doc.Path),
		Size:     size,
		Kind:     kind,
		Label:    label,
		Modified: modified,
		ReadOnly: isReadOnlyPath(doc.Path),
	}
}

func (a *App) OpenContainingFolder(path string) {
	if strings.TrimSpace(path) == "" {
		return
	}
	dir := filepath.Dir(path)
	abs, err := filepath.Abs(dir)
	if err == nil {
		dir = abs
	}
	openDir(dir)
}

func (a *App) GetStoragePath() string {
	if a.store != nil {
		return a.store.Root()
	}
	return ""
}

// ReadFileBase64 reads file bytes and returns base64 for frontend rendering
func (a *App) ReadFileBase64(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("empty path")
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	// Limit to 50 MB to avoid memory issues
	if info.Size() > 50*1024*1024 {
		return "", fmt.Errorf("file too large (%s)", formatSize(info.Size()))
	}
	data, err := readOpenFile(path)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// ReadMarkdownAsset resolves an image beside a saved Markdown document and
// returns an embeddable URL. Browsers cannot directly load local file paths
// inside the desktop webview, so the native boundary supplies the bytes.
func (a *App) ReadMarkdownAsset(markdownPath, source string) (string, error) {
	path, err := resolveMarkdownAssetPath(markdownPath, source)
	if err != nil {
		return "", err
	}
	data, err := readFileWithinLimit(path, maxMarkdownImageSize)
	if err != nil {
		return "", err
	}
	mimeType := markdownImageMIMEType(path)
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func formatSize(b int64) string {
	if b < 1024 {
		return fmt.Sprintf("%d B", b)
	}
	if b < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(b)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(b)/(1024*1024))
}

func (a *App) OpenURL(url string) {
	if !isAllowedExternalURL(url) {
		return
	}
	if strings.TrimSpace(url) == "" {
		return
	}
	runtime.BrowserOpenURL(a.ctx, url)
}

func openDir(dir string) {
	var cmd string
	var args []string
	switch goruntime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{dir}
	case "windows":
		cmd = "explorer"
		args = []string{dir}
	default:
		cmd = "xdg-open"
		args = []string{dir}
	}
	_ = exec.Command(cmd, args...).Start()
}

func (a *App) OpenExternalPath(path string) {
	if strings.TrimSpace(path) == "" {
		return
	}
	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
	}
	openDir(path)
}

func (a *App) ReorderNotes(ids []string) SessionState {
	byID := make(map[string]*session.Document, len(a.sess.Documents))
	for _, doc := range a.sess.Documents {
		byID[doc.ID] = doc
	}
	reordered := make([]*session.Document, 0, len(ids))
	for _, id := range ids {
		if doc, ok := byID[id]; ok {
			reordered = append(reordered, doc)
			delete(byID, id)
		}
	}
	for _, doc := range a.sess.Documents {
		if _, ok := byID[doc.ID]; ok {
			reordered = append(reordered, doc)
		}
	}
	a.sess.Documents = reordered
	a.recordBackgroundError("session persistence", a.store.Save(a.sess))
	return a.GetSession()
}

func fileKindAndSize(path string) (string, int64) {
	if strings.TrimSpace(path) == "" {
		return "markdown", 0
	}
	info, err := os.Stat(path)
	size := int64(0)
	if err == nil {
		size = info.Size()
	}
	return fileKind(path), size
}

func fileKind(path string) string {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	switch ext {
	case "md", "markdown", "mdx":
		return "markdown"
	case "txt", "log", "csv", "tsv":
		return "text"
	case "pdf":
		return "pdf"
	case "epub", "mobi", "azw", "azw3", "fb2":
		return "ebook"
	case "doc", "docx", "odt", "rtf", "pages":
		return "office"
	case "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "ico":
		return "image"
	case "zip", "tar", "gz", "bz2", "xz", "7z", "rar":
		return "archive"
	case "py", "js", "ts", "jsx", "tsx", "go", "rs", "rb", "lua", "sh", "bash", "zsh", "fish", "json", "yaml", "yml", "xml", "toml", "ini", "cfg", "conf", "properties", "env", "html", "htm", "css", "scss", "less", "svg", "vue", "svelte", "sql", "c", "cpp", "h", "hpp", "java", "cs", "kt", "swift", "dart", "r", "pl", "php", "ex", "exs", "zig", "nim", "ps1", "bat", "cmd", "gradle", "tf", "hcl", "diff", "patch":
		return "code"
	default:
		return "text"
	}
}

func draftKind(format string) string {
	switch strings.TrimPrefix(strings.ToLower(format), ".") {
	case "md", "markdown", "mdx", "":
		return "markdown"
	case "txt", "log", "csv", "tsv":
		return "text"
	default:
		return "code"
	}
}

func draftExtension(format string) string {
	format = strings.TrimPrefix(strings.ToLower(format), ".")
	switch format {
	case "txt", "json", "yaml":
		return format
	default:
		return "md"
	}
}

func replaceSessionPath(sess *session.Session, oldPath string, newPath string, title string) {
	for _, bookmark := range sess.Bookmarks {
		if filepath.Clean(bookmark.Path) == filepath.Clean(oldPath) {
			bookmark.Path = newPath
			bookmark.Title = title
		}
	}
	for _, recent := range sess.RecentFiles {
		if filepath.Clean(recent.Path) == filepath.Clean(oldPath) {
			recent.Path = newPath
			recent.Title = title
		}
	}
	for path, mode := range sess.ViewModes {
		if filepath.Clean(path) == filepath.Clean(oldPath) {
			delete(sess.ViewModes, path)
			sess.ViewModes[filepath.Clean(newPath)] = mode
		}
	}
}

func isReadOnlyPath(path string) bool {
	switch fileKind(path) {
	case "pdf", "ebook", "office", "image", "archive":
		return true
	default:
		return false
	}
}

func looksBinary(data []byte) bool {
	limit := len(data)
	if limit > 8192 {
		limit = 8192
	}
	for i := 0; i < limit; i++ {
		if data[i] == 0 {
			return true
		}
	}
	return false
}
