package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"markpad/internal/session"
)

const (
	fileTrashDir      = "trash/files"
	fileTrashManifest = "trash/trash.json"
	fileTrashDays     = 30
)

type FileTrashItem struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	OriginalPath string    `json:"originalPath"`
	TrashPath    string    `json:"trashPath"`
	DeletedAt    time.Time `json:"deletedAt"`
	Size         int64     `json:"size"`
	Kind         string    `json:"kind"`
}

type fileTrashState struct {
	Version int             `json:"version"`
	Items   []FileTrashItem `json:"items"`
}

func (a *App) ListFileTrash() []FileTrashItem {
	if a == nil || a.store == nil {
		return []FileTrashItem{}
	}
	items, _ := a.pruneFileTrash()
	return items
}

func (a *App) MoveFileToTrash(id string) (SessionState, error) {
	if a == nil || a.store == nil || a.sess == nil {
		return a.GetSession(), errors.New("app is not ready")
	}
	doc := a.sess.Find(id)
	if doc == nil {
		return a.GetSession(), errors.New("document not found")
	}
	if strings.TrimSpace(doc.Path) == "" {
		return a.GetSession(), errors.New("draft trash is handled in the renderer")
	}
	source, err := filepath.Abs(doc.Path)
	if err == nil {
		doc.Path = source
	}
	info, err := os.Stat(doc.Path)
	if err != nil {
		return a.GetSession(), err
	}
	if info.IsDir() {
		return a.GetSession(), errors.New("folders are not supported")
	}

	trashID := newTrashID()
	trashRel := filepath.Join(fileTrashDir, trashID+filepath.Ext(doc.Path))
	trashPath := filepath.Join(a.store.Root(), trashRel)
	if err := os.MkdirAll(filepath.Dir(trashPath), 0o755); err != nil {
		return a.GetSession(), err
	}
	if err := copyFile(doc.Path, trashPath); err != nil {
		return a.GetSession(), err
	}
	if err := os.Remove(doc.Path); err != nil {
		_ = os.Remove(trashPath)
		return a.GetSession(), err
	}

	state, _ := a.readFileTrashState()
	state.Items = append([]FileTrashItem{{
		ID:           trashID,
		Title:        doc.Title,
		OriginalPath: doc.Path,
		TrashPath:    trashPath,
		DeletedAt:    time.Now(),
		Size:         info.Size(),
		Kind:         fileKind(doc.Path),
	}}, state.Items...)
	_ = a.writeFileTrashState(state)

	a.removeDocumentFromSession(id)
	a.removeRecentPath(doc.Path)
	_ = a.store.Save(a.sess)
	return a.GetSession(), nil
}

func (a *App) RestoreFileTrash(id string) (SessionState, error) {
	if a == nil || a.store == nil {
		return a.GetSession(), errors.New("app is not ready")
	}
	state, err := a.readFileTrashState()
	if err != nil {
		return a.GetSession(), err
	}
	index := -1
	var item FileTrashItem
	for i, candidate := range state.Items {
		if candidate.ID == id {
			index = i
			item = candidate
			break
		}
	}
	if index < 0 {
		return a.GetSession(), errors.New("trash item not found")
	}
	restorePath := restoreCollisionPath(item.OriginalPath)
	if err := os.MkdirAll(filepath.Dir(restorePath), 0o755); err != nil {
		return a.GetSession(), err
	}
	if err := copyFile(item.TrashPath, restorePath); err != nil {
		return a.GetSession(), err
	}
	if err := os.Remove(item.TrashPath); err != nil {
		return a.GetSession(), err
	}
	state.Items = append(state.Items[:index], state.Items[index+1:]...)
	_ = a.writeFileTrashState(state)
	return a.openPath(restorePath)
}

func (a *App) DeleteFileTrash(id string) []FileTrashItem {
	if a == nil || a.store == nil {
		return []FileTrashItem{}
	}
	state, err := a.readFileTrashState()
	if err != nil {
		return []FileTrashItem{}
	}
	filtered := state.Items[:0]
	for _, item := range state.Items {
		if item.ID == id {
			_ = os.Remove(item.TrashPath)
			continue
		}
		filtered = append(filtered, item)
	}
	state.Items = filtered
	_ = a.writeFileTrashState(state)
	items, _ := a.pruneFileTrash()
	return items
}

func (a *App) EmptyFileTrash() []FileTrashItem {
	if a == nil || a.store == nil {
		return []FileTrashItem{}
	}
	state, err := a.readFileTrashState()
	if err != nil {
		return []FileTrashItem{}
	}
	for _, item := range state.Items {
		_ = os.Remove(item.TrashPath)
	}
	state.Items = nil
	_ = a.writeFileTrashState(state)
	return []FileTrashItem{}
}

func (a *App) pruneFileTrash() ([]FileTrashItem, error) {
	state, err := a.readFileTrashState()
	if err != nil {
		return []FileTrashItem{}, err
	}
	cutoff := time.Now().AddDate(0, 0, -fileTrashDays)
	filtered := state.Items[:0]
	changed := false
	for _, item := range state.Items {
		if item.DeletedAt.Before(cutoff) {
			_ = os.Remove(item.TrashPath)
			changed = true
			continue
		}
		if _, err := os.Stat(item.TrashPath); err != nil {
			changed = true
			continue
		}
		filtered = append(filtered, item)
	}
	state.Items = filtered
	if changed {
		_ = a.writeFileTrashState(state)
	}
	return state.Items, nil
}

func (a *App) readFileTrashState() (fileTrashState, error) {
	state := fileTrashState{Version: 1}
	if a == nil || a.store == nil {
		return state, errors.New("app is not ready")
	}
	data, err := os.ReadFile(filepath.Join(a.store.Root(), fileTrashManifest))
	if errors.Is(err, os.ErrNotExist) {
		return state, nil
	}
	if err != nil {
		return state, err
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return fileTrashState{Version: 1}, err
	}
	if state.Version == 0 {
		state.Version = 1
	}
	return state, nil
}

func (a *App) writeFileTrashState(state fileTrashState) error {
	if a == nil || a.store == nil {
		return errors.New("app is not ready")
	}
	state.Version = 1
	path := filepath.Join(a.store.Root(), fileTrashManifest)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return trashAtomicWrite(path, data, 0o644)
}

func (a *App) removeDocumentFromSession(id string) {
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
			doc := session.NewDocument("", "")
			doc.Title = "Untitled"
			a.sess.Add(doc)
			_ = a.store.WriteDraft(doc, "")
		}
	}
}

func (a *App) removeRecentPath(path string) {
	filtered := a.sess.RecentFiles[:0]
	for _, recent := range a.sess.RecentFiles {
		if filepath.Clean(recent.Path) != filepath.Clean(path) {
			filtered = append(filtered, recent)
		}
	}
	a.sess.RecentFiles = filtered
}

func copyFile(source string, target string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

func trashAtomicWrite(path string, data []byte, perm os.FileMode) error {
	tmp := fmt.Sprintf("%s.tmp.%d", path, time.Now().UnixNano())
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func newTrashID() string {
	var b [6]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return time.Now().Format("20060102-150405") + "-" + hex.EncodeToString(b[:])
}

func restoreCollisionPath(path string) string {
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return path
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	for i := 1; ; i++ {
		candidate := fmt.Sprintf("%s restored %d%s", base, i, ext)
		if _, err := os.Stat(candidate); errors.Is(err, os.ErrNotExist) {
			return candidate
		}
	}
}
