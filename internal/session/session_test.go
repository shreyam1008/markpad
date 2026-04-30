package session

import (
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
