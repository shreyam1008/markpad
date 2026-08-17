package session

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestStorePersistsDraftsAndSession(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	doc := NewDocument("", "# Saved in the draft\n\nBody")
	sess := &Session{ActiveID: doc.ID, Documents: []*Document{doc}}

	if err := store.WriteDraft(doc, "# Edited\n\nStill here"); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(sess); err != nil {
		t.Fatal(err)
	}

	loaded, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ActiveID != doc.ID {
		t.Fatalf("active id = %q, want %q", loaded.ActiveID, doc.ID)
	}
	got, err := store.ReadDraft(loaded.Active())
	if err != nil {
		t.Fatal(err)
	}
	if got != "# Edited\n\nStill here" {
		t.Fatalf("draft = %q", got)
	}
}

func TestSaveToDiskMarksClean(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "note.md")
	doc := NewDocument(path, "# Old")
	doc.Dirty = true

	if err := store.SaveToDisk(doc, "# New"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "# New" {
		t.Fatalf("file = %q", data)
	}
	if doc.Dirty {
		t.Fatal("document stayed dirty after save")
	}
}

func TestSaveAsSetsAbsolutePathAndPreservesExtension(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "draft.log")
	doc := NewDocument("", "# Draft")

	if err := store.SaveAs(doc, path, "plain log"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "plain log" {
		t.Fatalf("file = %q", data)
	}
	if !filepath.IsAbs(doc.Path) {
		t.Fatalf("path is not absolute: %q", doc.Path)
	}
	if doc.Title != "draft.log" {
		t.Fatalf("title = %q", doc.Title)
	}
	if doc.Dirty {
		t.Fatal("document stayed dirty after save as")
	}
}

func TestSaveAsFailureLeavesDocumentUnchanged(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	doc := NewDocument("", "# Unsaved draft")
	doc.ViewMode = "split"
	before := *doc

	blocker := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(blocker, []byte("keep me"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveAs(doc, filepath.Join(blocker, "note.md"), "new content"); err == nil {
		t.Fatal("SaveAs succeeded through a non-directory path")
	}
	if !reflect.DeepEqual(*doc, before) {
		t.Fatalf("document changed after failed SaveAs:\n got: %#v\nwant: %#v", *doc, before)
	}
	data, err := os.ReadFile(blocker)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "keep me" {
		t.Fatalf("blocking file = %q, want it unchanged", data)
	}
}

func TestSaveAsDraftFailureRollsBackDocumentState(t *testing.T) {
	root := t.TempDir()
	store, err := NewStoreAt(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(root, draftsDir)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, draftsDir), []byte("block drafts"), 0o600); err != nil {
		t.Fatal(err)
	}

	doc := NewDocument("", "# Unsaved draft")
	before := *doc
	target := filepath.Join(t.TempDir(), "note.txt")
	if err := store.SaveAs(doc, target, "new content"); err == nil {
		t.Fatal("SaveAs succeeded when its recovery draft could not be written")
	}
	if !reflect.DeepEqual(*doc, before) {
		t.Fatalf("document changed after failed SaveAs:\n got: %#v\nwant: %#v", *doc, before)
	}
	if _, err := os.Stat(target); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("new target changed after failed SaveAs: stat error = %v", err)
	}
}

func TestSaveAsDraftFailureLeavesExistingTargetUnchanged(t *testing.T) {
	root := t.TempDir()
	store, err := NewStoreAt(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(root, draftsDir)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, draftsDir), []byte("block drafts"), 0o600); err != nil {
		t.Fatal(err)
	}

	doc := NewDocument("", "# Unsaved draft")
	before := *doc
	target := filepath.Join(t.TempDir(), "existing.txt")
	if err := os.WriteFile(target, []byte("existing content"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveAs(doc, target, "new content"); err == nil {
		t.Fatal("SaveAs succeeded when its recovery draft could not be written")
	}
	if !reflect.DeepEqual(*doc, before) {
		t.Fatalf("document changed after failed SaveAs:\n got: %#v\nwant: %#v", *doc, before)
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "existing content" {
		t.Fatalf("existing target = %q, want it unchanged", data)
	}
}

func TestLoadPreservesCorruptSessionAndStartsClean(t *testing.T) {
	root := t.TempDir()
	store, err := NewStoreAt(root)
	if err != nil {
		t.Fatal(err)
	}
	corrupt := []byte(`{"active_id": "unfinished"`)
	if err := os.WriteFile(filepath.Join(root, sessionFile), corrupt, 0o600); err != nil {
		t.Fatal(err)
	}
	orphanedDraft := filepath.Join(root, draftsDir, "previous-draft.md")
	if err := os.WriteFile(orphanedDraft, []byte("recoverable old draft"), 0o600); err != nil {
		t.Fatal(err)
	}

	loaded, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Active() == nil || len(loaded.Documents) != 1 {
		t.Fatalf("clean session was not initialized: %#v", loaded)
	}
	if loaded.ActiveID == "" || loaded.ActiveID != loaded.Active().ID {
		t.Fatalf("active document is invalid: active_id=%q document=%#v", loaded.ActiveID, loaded.Active())
	}

	backupPath := store.RecoveredSessionPath()
	if backupPath == "" {
		t.Fatal("corrupt session recovery path was not recorded")
	}
	if !strings.HasPrefix(filepath.Base(backupPath), corruptSessionStem) {
		t.Fatalf("recovery filename = %q", filepath.Base(backupPath))
	}
	backup, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(backup) != string(corrupt) {
		t.Fatalf("recovery bytes = %q, want %q", backup, corrupt)
	}
	oldDraft, err := os.ReadFile(orphanedDraft)
	if err != nil {
		t.Fatal(err)
	}
	if string(oldDraft) != "recoverable old draft" {
		t.Fatalf("old draft = %q, want it preserved", oldDraft)
	}
	cleanDraft, err := store.ReadDraft(loaded.Active())
	if err != nil {
		t.Fatal(err)
	}
	if cleanDraft != defaultDraftContent {
		t.Fatalf("clean draft = %q, want %q", cleanDraft, defaultDraftContent)
	}

	reloaded, err := store.Load()
	if err != nil {
		t.Fatalf("clean replacement session could not be loaded: %v", err)
	}
	if reloaded.ActiveID != loaded.ActiveID {
		t.Fatalf("replacement active id = %q, want %q", reloaded.ActiveID, loaded.ActiveID)
	}
	if store.RecoveredSessionPath() != "" {
		t.Fatalf("normal reload reported another recovery: %q", store.RecoveredSessionPath())
	}
}

func TestLoadRecoversSemanticallyCorruptSessions(t *testing.T) {
	tests := map[string]string{
		"null document":          `{"active_id":"doc","documents":[null]}`,
		"unsafe document id":     `{"active_id":"../doc","documents":[{"id":"../doc","draft_file":"doc.md"}]}`,
		"unsafe draft filename":  `{"active_id":"doc","documents":[{"id":"doc","draft_file":"../doc.md"}]}`,
		"duplicate document id":  `{"active_id":"doc","documents":[{"id":"doc","draft_file":"one.md"},{"id":"DOC","draft_file":"two.md"}]}`,
		"duplicate draft file":   `{"active_id":"one","documents":[{"id":"one","draft_file":"same.md"},{"id":"two","draft_file":"SAME.md"}]}`,
		"null bookmark":          `{"active_id":"doc","documents":[{"id":"doc","draft_file":"doc.md"}],"bookmarks":[null]}`,
		"unsafe bookmark id":     `{"active_id":"doc","documents":[{"id":"doc","draft_file":"doc.md"}],"bookmarks":[{"id":"../bookmark"}]}`,
		"duplicate bookmark id":  `{"active_id":"doc","documents":[{"id":"doc","draft_file":"doc.md"}],"bookmarks":[{"id":"bookmark"},{"id":"BOOKMARK"}]}`,
		"null recent file":       `{"active_id":"doc","documents":[{"id":"doc","draft_file":"doc.md"}],"recent_files":[null]}`,
		"windows reserved draft": `{"active_id":"doc","documents":[{"id":"doc","draft_file":"CON.md"}]}`,
	}

	for name, raw := range tests {
		t.Run(name, func(t *testing.T) {
			if !json.Valid([]byte(raw)) {
				t.Fatalf("test fixture is not valid JSON: %q", raw)
			}
			root := t.TempDir()
			store, err := NewStoreAt(root)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(root, sessionFile), []byte(raw), 0o600); err != nil {
				t.Fatal(err)
			}

			loaded, err := store.Load()
			if err != nil {
				t.Fatal(err)
			}
			if len(loaded.Documents) != 1 || loaded.Active() == nil {
				t.Fatalf("clean session was not initialized: %#v", loaded)
			}
			backupPath := store.RecoveredSessionPath()
			if backupPath == "" {
				t.Fatal("semantic corruption did not produce a recovery backup")
			}
			backup, err := os.ReadFile(backupPath)
			if err != nil {
				t.Fatal(err)
			}
			if string(backup) != raw {
				t.Fatalf("recovery bytes = %q, want %q", backup, raw)
			}
		})
	}
}

func TestHistoryTimestampRoundTripPreservesNanoseconds(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	doc := NewDocument("", "first")
	if err := store.SaveSnapshot(doc.ID, "first", "save"); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveSnapshot(doc.ID, "second", "save"); err != nil {
		t.Fatal(err)
	}

	entries, err := store.ListHistory(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("history entries = %d, want 2", len(entries))
	}
	for _, entry := range entries {
		if _, err := store.GetSnapshotContent(doc.ID, entry.Timestamp); err != nil {
			t.Fatalf("timestamp %q did not round-trip: %v", entry.Timestamp, err)
		}
	}
}
