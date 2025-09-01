package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"markpad/internal/session"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx   context.Context
	store *session.Store
	sess  *session.Session
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
}

type RecentInfo struct {
	Path  string `json:"path"`
	Title string `json:"title"`
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
		state.Notes = append(state.Notes, NoteInfo{
			ID:    doc.ID,
			Title: doc.Title,
			Path:  doc.Path,
			Dirty: doc.Dirty,
			Star:  a.sess.IsBookmarked(doc.Path),
		})
	}
	for _, bm := range a.sess.Bookmarks {
		state.Favorites = append(state.Favorites, NoteInfo{
			ID:    bm.ID,
			Title: bm.Title,
			Path:  bm.Path,
			Star:  true,
		})
	}
	for _, r := range a.sess.RecentFiles {
		state.Recents = append(state.Recents, RecentInfo{Path: r.Path, Title: r.Title})
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
			{DisplayName: "Markdown", Pattern: "*.md;*.markdown"},
			{DisplayName: "Text", Pattern: "*.txt"},
			{DisplayName: "All Files", Pattern: "*.*"},
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
	data, err := os.ReadFile(path)
	if err != nil {
		return a.GetSession(), err
	}
	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
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

func (a *App) OpenURL(url string) {
	if strings.TrimSpace(url) == "" {
		return
	}
	runtime.BrowserOpenURL(a.ctx, url)
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
