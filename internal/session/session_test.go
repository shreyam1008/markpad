package session

import (
	"errors"
	"os"
	"path/filepath"
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

func TestSaveToDiskProtectsExternalChangesUntilExplicitOverwrite(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "shared.md")
	if err := os.WriteFile(path, []byte("disk when opened"), 0o640); err != nil {
		t.Fatal(err)
	}
	doc := NewDocument(path, "disk when opened")
	doc.Dirty = true

	if err := os.WriteFile(path, []byte("changed in another editor"), 0o640); err != nil {
		t.Fatal(err)
	}
	err = store.SaveToDisk(doc, "markpad draft")
	var conflict *ExternalChangeError
	if !errors.As(err, &conflict) {
		t.Fatalf("SaveToDisk() error = %v, want ExternalChangeError", err)
	}
	if conflict.Kind != SourceModified {
		t.Fatalf("conflict kind = %q, want %q", conflict.Kind, SourceModified)
	}
	data, readErr := os.ReadFile(path)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if string(data) != "changed in another editor" {
		t.Fatalf("protected file = %q", data)
	}
	if !doc.Dirty {
		t.Fatal("conflicted document was marked clean")
	}

	if err := store.OverwriteToDisk(doc, "markpad draft"); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "markpad draft" {
		t.Fatalf("overwritten file = %q", data)
	}
	if doc.Dirty {
		t.Fatal("overwritten document stayed dirty")
	}

	doc.Dirty = true
	if err := store.SaveToDisk(doc, "next save"); err != nil {
		t.Fatalf("save after refreshed baseline: %v", err)
	}
}

func TestSaveToDiskDetectsDeletedSource(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "deleted.md")
	if err := os.WriteFile(path, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	doc := NewDocument(path, "original")
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}

	err = store.SaveToDisk(doc, "recreated by accident")
	var conflict *ExternalChangeError
	if !errors.As(err, &conflict) || conflict.Kind != SourceDeleted {
		t.Fatalf("SaveToDisk() error = %#v, want deleted conflict", err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("deleted source was recreated: %v", err)
	}
}

func TestLoadPreservesInvalidSessionAndStartsClean(t *testing.T) {
	for name, payload := range map[string]string{
		"invalid json":      `{not-json`,
		"unsafe draft path": `{"active_id":"doc","documents":[{"id":"doc","draft_file":"../escape.md"}]}`,
	} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			store, err := NewStoreAt(root)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(root, sessionFile), []byte(payload), 0o600); err != nil {
				t.Fatal(err)
			}
			loaded, err := store.Load()
			if err != nil {
				t.Fatal(err)
			}
			if len(loaded.Documents) != 1 || loaded.Active() == nil || !IsDefaultDraftContent(mustReadDraft(t, store, loaded.Active())) {
				t.Fatalf("clean recovery session = %#v", loaded)
			}
			backup := store.RecoveredSessionPath()
			if backup == "" {
				t.Fatal("invalid session was not preserved")
			}
			data, err := os.ReadFile(backup)
			if err != nil || string(data) != payload {
				t.Fatalf("recovery backup = %q, %v", data, err)
			}
		})
	}
}

func mustReadDraft(t *testing.T, store *Store, doc *Document) string {
	t.Helper()
	content, err := store.ReadDraft(doc)
	if err != nil {
		t.Fatal(err)
	}
	return content
}

func TestSaveToDiskDistinguishesAtomicReplacement(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "replaced.md")
	if err := os.WriteFile(path, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	doc := NewDocument(path, "original")
	replacement := filepath.Join(dir, "replacement.tmp")
	if err := os.WriteFile(replacement, []byte("external replacement"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(replacement, path); err != nil {
		t.Skipf("atomic replacement unavailable: %v", err)
	}

	err = store.SaveToDisk(doc, "markpad draft")
	var conflict *ExternalChangeError
	if !errors.As(err, &conflict) || conflict.Kind != SourceReplaced {
		t.Fatalf("SaveToDisk() error = %#v, want replaced conflict", err)
	}
}

func TestPersistedSourceIdentityProtectsAfterReopen(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "reopened.md")
	if err := os.WriteFile(path, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	doc := NewDocument(path, "original")
	sess := &Session{ActiveID: doc.ID, Documents: []*Document{doc}}
	if err := store.WriteDraft(doc, "original"); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(sess); err != nil {
		t.Fatal(err)
	}

	loaded, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	loadedDoc := loaded.Find(doc.ID)
	if loadedDoc == nil || loadedDoc.SourceState == nil || loadedDoc.SourceState.Identity == "" {
		t.Fatalf("persisted source state = %#v", loadedDoc)
	}
	replacement := filepath.Join(dir, "replacement.tmp")
	if err := os.WriteFile(replacement, []byte("external"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(replacement, path); err != nil {
		t.Skipf("atomic replacement unavailable: %v", err)
	}

	err = store.SaveToDisk(loadedDoc, "markpad draft")
	var conflict *ExternalChangeError
	if !errors.As(err, &conflict) || conflict.Kind != SourceReplaced {
		t.Fatalf("SaveToDisk() after reopen = %#v, want replaced conflict", err)
	}
}

func TestLoadMigratesSourceStateFromRecoveryDraft(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "reopen.md")
	if err := os.WriteFile(path, []byte("source before shutdown"), 0o600); err != nil {
		t.Fatal(err)
	}
	doc := NewDocument(path, "source before shutdown")
	doc.SourceState = nil // Simulate a session written by Markpad v0.10 or earlier.
	doc.Dirty = true
	sess := &Session{ActiveID: doc.ID, Documents: []*Document{doc}}
	if err := store.WriteDraft(doc, "source before shutdown\nmarkpad edit"); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(sess); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("source changed while markpad was closed"), 0o600); err != nil {
		t.Fatal(err)
	}

	loaded, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	loadedDoc := loaded.Find(doc.ID)
	if loadedDoc == nil || loadedDoc.SourceState == nil {
		t.Fatal("legacy saved document did not receive a source baseline")
	}
	err = store.SaveToDisk(loadedDoc, "source before shutdown\nmarkpad edit")
	var conflict *ExternalChangeError
	if !errors.As(err, &conflict) {
		t.Fatalf("SaveToDisk() error = %v, want conflict after reopen", err)
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
