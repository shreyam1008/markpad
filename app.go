package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	"markpad/internal/session"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx          context.Context
	store        *session.Store
	sess         *session.Session
	pendingFiles []string
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	store, err := session.NewStore("markpad")
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
	if a.store != nil && a.sess != nil {
		_ = a.store.Save(a.sess)
	}
}

// ---------- Types returned to frontend ----------

type NoteInfo struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Path  string `json:"path"`
	Dirty bool   `json:"dirty"`
	Star  bool   `json:"star"`
	Kind  string `json:"kind"`
	Size  int64  `json:"size"`
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

// ---------- Session methods ----------

func (a *App) GetSession() SessionState {
	state := SessionState{ActiveID: a.sess.ActiveID}
	for _, doc := range a.sess.Documents {
		kind, size := fileKindAndSize(doc.Path)
		state.Notes = append(state.Notes, NoteInfo{
			ID:    doc.ID,
			Title: doc.Title,
			Path:  doc.Path,
			Dirty: doc.Dirty,
			Star:  a.sess.IsBookmarked(doc.Path),
			Kind:  kind,
			Size:  size,
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
		_ = a.store.Save(a.sess)
	}
}

func (a *App) NewNote() SessionState {
	doc := session.NewDocument("", "")
	doc.Title = "Untitled"
	a.sess.Add(doc)
	_ = a.store.WriteDraft(doc, "")
	_ = a.store.Save(a.sess)
	runtime.WindowSetTitle(a.ctx, "Markpad - Untitled")
	return a.GetSession()
}

func (a *App) UpdateContent(id string, content string) {
	doc := a.sess.Find(id)
	if doc == nil {
		return
	}
	if isReadOnlyPath(doc.Path) {
		return
	}
	doc.Dirty = true
	doc.UpdatedAt = time.Now()
	if doc.Path == "" {
		doc.Title = session.TitleFromContent(content, "")
	}
	_ = a.store.WriteDraft(doc, content)
	_ = a.store.Save(a.sess)
}

func (a *App) SaveActive(content string) (SessionState, error) {
	doc := a.sess.Active()
	if doc == nil {
		return a.GetSession(), fmt.Errorf("no active note")
	}
	if doc.Path == "" {
		return a.SaveAsDialog(content)
	}
	if isReadOnlyPath(doc.Path) {
		return a.GetSession(), fmt.Errorf("read-only document: open externally to edit")
	}
	if err := a.store.SaveToDisk(doc, content); err != nil {
		return a.GetSession(), err
	}
	_ = a.store.SaveSnapshot(doc.ID, content, "save")
	runtime.WindowSetTitle(a.ctx, "Markpad - "+doc.Title)
	return a.GetSession(), nil
}

func (a *App) SaveAsDialog(content string) (SessionState, error) {
	doc := a.sess.Active()
	if doc == nil {
		return a.GetSession(), fmt.Errorf("no active note")
	}
	defaultName := "Untitled.md"
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
	_ = a.store.SaveSnapshot(doc.ID, content, "save-as")
	runtime.WindowSetTitle(a.ctx, "Markpad - "+doc.Title)
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
	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
	}
	info, err := os.Stat(path)
	if err != nil {
		return a.GetSession(), err
	}
	if info.IsDir() {
		return a.GetSession(), fmt.Errorf("folders are not supported")
	}
	if isReadOnlyPath(path) {
		doc := a.sess.AddFile(path, "")
		a.sess.AddRecent(path)
		_ = a.store.WriteDraft(doc, "")
		_ = a.store.Save(a.sess)
		runtime.WindowSetTitle(a.ctx, "Markpad - "+doc.Title)
		return a.GetSession(), nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return a.GetSession(), err
	}
	if looksBinary(data) {
		doc := a.sess.AddFile(path, "")
		a.sess.AddRecent(path)
		_ = a.store.WriteDraft(doc, "")
		_ = a.store.Save(a.sess)
		runtime.WindowSetTitle(a.ctx, "Markpad - "+doc.Title)
		return a.GetSession(), nil
	}
	doc := a.sess.AddFile(path, string(data))
	a.sess.AddRecent(path)
	_ = a.store.WriteDraft(doc, string(data))
	_ = a.store.SaveSnapshot(doc.ID, string(data), "open")
	_ = a.store.Save(a.sess)
	runtime.WindowSetTitle(a.ctx, "Markpad - "+doc.Title)
	return a.GetSession(), nil
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
	doc := a.sess.Find(id)
	if doc == nil {
		return a.GetSession(), fmt.Errorf("note not found")
	}
	content, err := a.store.GetSnapshotContent(doc.ID, timestamp)
	if err != nil {
		return a.GetSession(), err
	}
	doc.Dirty = true
	doc.UpdatedAt = time.Now()
	_ = a.store.WriteDraft(doc, content)
	_ = a.store.SaveSnapshot(doc.ID, content, "restore")
	_ = a.store.Save(a.sess)
	return a.GetSession(), nil
}

func (a *App) ToggleStar(id string) SessionState {
	doc := a.sess.Find(id)
	if doc == nil || doc.Path == "" {
		return a.GetSession()
	}
	content, _ := a.store.ReadDraft(doc)
	a.sess.ToggleBookmark(doc.Path, content)
	_ = a.store.Save(a.sess)
	return a.GetSession()
}

func (a *App) OpenPathFromBookmark(path string) (SessionState, error) {
	if strings.TrimSpace(path) == "" {
		return a.GetSession(), nil
	}
	return a.openPath(path)
}

func (a *App) CloseNote(id string) SessionState {
	if strings.TrimSpace(id) == "" || a.sess == nil {
		return a.GetSession()
	}
	next := ""
	filtered := a.sess.Documents[:0]
	for _, doc := range a.sess.Documents {
		if doc.ID == id {
			continue
		}
		if next == "" {
			next = doc.ID
		}
		filtered = append(filtered, doc)
	}
	a.sess.Documents = filtered
	if len(a.sess.Documents) == 0 {
		doc := session.NewDocument("", "")
		doc.Title = "Untitled"
		a.sess.Add(doc)
		_ = a.store.WriteDraft(doc, "")
	} else if a.sess.ActiveID == id {
		a.sess.ActiveID = next
	}
	_ = a.store.Save(a.sess)
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
	_ = a.store.Save(a.sess)
	return a.GetSession()
}

func (a *App) DeleteNote(id string) SessionState {
	target := a.sess.Find(id)
	if target == nil || target.Path != "" {
		return a.GetSession()
	}
	filtered := make([]*session.Document, 0, len(a.sess.Documents))
	for _, doc := range a.sess.Documents {
		if doc.ID != id {
			filtered = append(filtered, doc)
		}
	}
	a.sess.Documents = filtered
	if a.sess.ActiveID == id {
		if len(a.sess.Documents) > 0 {
			a.sess.ActiveID = a.sess.Documents[0].ID
		} else {
			a.sess.ActiveID = ""
		}
	}
	_ = a.store.Save(a.sess)
	return a.GetSession()
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
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
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
	_ = a.store.Save(a.sess)
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
	case "py", "js", "ts", "jsx", "tsx", "go", "rs", "rb", "lua", "sh", "bash", "zsh", "fish", "json", "yaml", "yml", "xml", "toml", "ini", "cfg", "conf", "properties", "env", "html", "htm", "css", "scss", "less", "svg", "vue", "svelte", "sql", "c", "cpp", "h", "hpp", "java", "cs", "kt", "swift", "dart", "r", "pl", "php", "ex", "exs", "zig", "nim", "ps1", "bat", "cmd", "gradle", "tf", "hcl":
		return "code"
	default:
		return "text"
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
