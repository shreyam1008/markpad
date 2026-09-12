package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"markpad/internal/session"
)

func TestSaveActiveProtectsExternalEditAndPersistsRecoveryDraft(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "shared.md")
	if err := os.WriteFile(path, []byte("opened content"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := newDocumentTestApp(t)
	doc := app.sess.AddFile(path, "opened content")
	app.sess.ActiveID = doc.ID
	doc.Dirty = true
	if err := app.store.WriteDraft(doc, "markpad recovery"); err != nil {
		t.Fatal(err)
	}
	if err := app.store.Save(app.sess); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("external edit"), 0o600); err != nil {
		t.Fatal(err)
	}

	result, err := app.SaveActive("markpad recovery", false)
	if err != nil {
		t.Fatal(err)
	}
	if result.Conflict == nil || result.Conflict.Kind != string(session.SourceModified) {
		t.Fatalf("save result conflict = %#v", result.Conflict)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(disk) != "external edit" {
		t.Fatalf("protected disk content = %q", disk)
	}
	draft, err := app.store.ReadDraft(doc)
	if err != nil || draft != "markpad recovery" {
		t.Fatalf("recovery draft = %q, %v", draft, err)
	}
	reloaded, err := app.store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded := reloaded.Find(doc.ID); loaded == nil || !loaded.Dirty {
		t.Fatal("conflicted draft was not persisted as dirty")
	}

	result, err = app.SaveActive("markpad recovery", true)
	if err != nil {
		t.Fatal(err)
	}
	if result.Conflict != nil {
		t.Fatalf("explicit overwrite conflict = %#v", result.Conflict)
	}
	disk, err = os.ReadFile(path)
	if err != nil || string(disk) != "markpad recovery" {
		t.Fatalf("overwritten disk content = %q, %v", disk, err)
	}
}

func TestReloadActiveFromDiskPreservesMarkpadDraftInHistory(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "reload.md")
	if err := os.WriteFile(path, []byte("opened content"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := newDocumentTestApp(t)
	doc := app.sess.AddFile(path, "opened content")
	app.sess.ActiveID = doc.ID
	doc.Dirty = true
	if err := app.store.WriteDraft(doc, "valuable markpad draft"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("new disk content"), 0o600); err != nil {
		t.Fatal(err)
	}

	state, err := app.ReloadActiveFromDisk("valuable markpad draft")
	if err != nil {
		t.Fatal(err)
	}
	active := state.Notes[0]
	for _, note := range state.Notes {
		if note.ID == state.ActiveID {
			active = note
			break
		}
	}
	if active.Dirty {
		t.Fatal("reloaded source stayed dirty")
	}
	draft, err := app.store.ReadDraft(doc)
	if err != nil || draft != "new disk content" {
		t.Fatalf("reloaded draft = %q, %v", draft, err)
	}
	entries, err := app.store.ListHistory(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) < 2 || entries[0].Source != "external-reload" {
		t.Fatalf("reload history = %#v", entries)
	}
	foundRecovery := false
	for _, entry := range entries {
		if entry.Source != "before-external-reload" {
			continue
		}
		content, err := app.store.GetSnapshotContent(doc.ID, entry.Timestamp)
		if err == nil && content == "valuable markpad draft" {
			foundRecovery = true
		}
	}
	if !foundRecovery {
		t.Fatal("pre-reload Markpad draft was not preserved in history")
	}
}

func TestDeleteFileCleansOpenDocumentState(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	path := filepath.Join(root, "delete-me.md")
	if err := os.WriteFile(path, []byte("saved content"), 0o600); err != nil {
		t.Fatal(err)
	}
	path = canonicalPath(path)
	app := newDocumentTestApp(t)
	doc := app.sess.AddFile(path, "saved content")
	doc.Dirty = true
	app.sess.BookmarkFile(path, "saved content")
	app.sess.AddRecent(path)
	app.sess.RememberViewMode(doc, "split")
	if err := app.store.WriteDraft(doc, "unsaved content"); err != nil {
		t.Fatal(err)
	}
	if err := app.store.SaveSnapshot(doc.ID, "saved content", "open"); err != nil {
		t.Fatal(err)
	}

	state, err := app.DeleteFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("deleted file status = %v", err)
	}
	if app.sess.Find(doc.ID) != nil {
		t.Fatal("deleted file remained in open documents")
	}
	if app.sess.FindBookmark(path) != nil || len(app.sess.RecentFiles) != 0 {
		t.Fatal("deleted file remained in bookmarks or recents")
	}
	if _, ok := app.sess.ViewModes[filepath.Clean(path)]; ok {
		t.Fatal("deleted file view mode remained")
	}
	if _, err := os.Stat(app.store.DraftPath(doc)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("deleted document draft status = %v", err)
	}
	history, err := app.store.ListHistory(doc.ID)
	if err != nil || len(history) != 0 {
		t.Fatalf("deleted document history = %#v, %v", history, err)
	}
	if len(state.Notes) != 1 || state.ActiveID == "" || state.Notes[0].Path != "" {
		t.Fatalf("fallback session = %#v", state)
	}
	reloaded, err := app.store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Find(doc.ID) != nil || reloaded.FindBookmark(path) != nil || len(reloaded.RecentFiles) != 0 {
		t.Fatal("deleted file references remained in persisted session")
	}
}

func TestDeleteFileAuthorizationAndPathSafety(t *testing.T) {
	t.Parallel()
	workspaceRoot := t.TempDir()
	outsideRoot := t.TempDir()
	inside := filepath.Join(workspaceRoot, "inside.md")
	outside := filepath.Join(outsideRoot, "outside.md")
	for _, path := range []string{inside, outside} {
		if err := os.WriteFile(path, []byte("content"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	inside = canonicalPath(inside)
	outside = canonicalPath(outside)
	app := newDocumentTestApp(t)

	if _, err := app.DeleteFile(outside); err == nil {
		t.Fatal("expected an unopened outside file to be rejected")
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatal("unauthorized outside file was altered")
	}

	doc := app.sess.AddFile(outside, "content")
	if err := app.store.WriteDraft(doc, "content"); err != nil {
		t.Fatal(err)
	}
	if _, err := app.DeleteFile(outside); err != nil {
		t.Fatalf("delete open outside file: %v", err)
	}
	if _, err := os.Stat(outside); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("open outside file status = %v", err)
	}

	directory := filepath.Join(workspaceRoot, "folder")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := app.DeleteFile(directory); err == nil {
		t.Fatal("expected directory deletion to be rejected")
	}
	if _, err := os.Stat(directory); err != nil {
		t.Fatal("directory was altered")
	}
}

func TestDeleteFileRejectsOpenSymlink(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	outsideRoot := t.TempDir()
	outside := filepath.Join(outsideRoot, "outside.md")
	if err := os.WriteFile(outside, []byte("content"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "linked.md")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	app := newDocumentTestApp(t)
	app.sess.AddFile(link, "content")
	if _, err := app.DeleteFile(link); err == nil {
		t.Fatal("expected symlink deletion to be rejected")
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatal("symlink target was altered")
	}
}

func TestDiscardNoteCleanup(t *testing.T) {
	t.Parallel()
	t.Run("unsaved note", func(t *testing.T) {
		app := newDocumentTestApp(t)
		doc := session.NewDocument("", "unsaved")
		app.sess.Add(doc)
		if err := app.store.WriteDraft(doc, "unsaved"); err != nil {
			t.Fatal(err)
		}
		if err := app.store.SaveSnapshot(doc.ID, "unsaved", "restore"); err != nil {
			t.Fatal(err)
		}

		app.DiscardNote(doc.ID)
		if app.sess.Find(doc.ID) != nil {
			t.Fatal("discarded unsaved note remained open")
		}
		if _, err := os.Stat(app.store.DraftPath(doc)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("discarded draft status = %v", err)
		}
		history, err := app.store.ListHistory(doc.ID)
		if err != nil || len(history) != 0 {
			t.Fatalf("discarded history = %#v, %v", history, err)
		}
	})

	t.Run("saved dirty note", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "saved.md")
		if err := os.WriteFile(path, []byte("disk version"), 0o600); err != nil {
			t.Fatal(err)
		}
		app := newDocumentTestApp(t)
		doc := app.sess.AddFile(path, "disk version")
		doc.Dirty = true
		if err := app.store.WriteDraft(doc, "dirty version"); err != nil {
			t.Fatal(err)
		}

		app.DiscardNote(doc.ID)
		if app.sess.Find(doc.ID) != nil {
			t.Fatal("discarded saved note remained open")
		}
		if _, err := os.Stat(app.store.DraftPath(doc)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("discarded saved draft status = %v", err)
		}
		disk, err := os.ReadFile(path)
		if err != nil || string(disk) != "disk version" {
			t.Fatalf("saved file = %q, %v", disk, err)
		}
	})
}

func TestDeleteNoteRemovesConfirmedDirtyDraft(t *testing.T) {
	t.Parallel()
	app := newDocumentTestApp(t)
	doc := session.NewDocument("", "dirty draft")
	app.sess.Add(doc)
	if err := app.store.WriteDraft(doc, "dirty draft"); err != nil {
		t.Fatal(err)
	}

	app.DeleteNote(doc.ID)
	if app.sess.Find(doc.ID) != nil {
		t.Fatal("confirmed dirty draft remained open")
	}
	if _, err := os.Stat(app.store.DraftPath(doc)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("confirmed dirty draft status = %v", err)
	}
}

func newDocumentTestApp(t *testing.T) *App {
	t.Helper()
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	doc := session.NewDocument("", "")
	sess := &session.Session{
		ActiveID:  doc.ID,
		Documents: []*session.Document{doc},
		ViewModes: make(map[string]string),
	}
	if err := store.WriteDraft(doc, ""); err != nil {
		t.Fatal(err)
	}
	return &App{store: store, sess: sess}
}
