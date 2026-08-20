package main

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"markpad/internal/session"
)

func TestRestoreVersionSnapshotsImmediatePreRestoreContent(t *testing.T) {
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	doc := session.NewDocument("", "working changes")
	sess := &session.Session{
		ActiveID:  doc.ID,
		Documents: []*session.Document{doc},
	}
	if err := store.WriteDraft(doc, "working changes"); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveSnapshot(doc.ID, "older version", "save"); err != nil {
		t.Fatal(err)
	}
	before, err := store.ListHistory(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(before) != 1 {
		t.Fatalf("initial history entries = %d, want 1", len(before))
	}

	app := &App{store: store, sess: sess}
	if _, err := app.RestoreVersion(doc.ID, before[0].Timestamp); err != nil {
		t.Fatal(err)
	}
	restored, err := store.ReadDraft(doc)
	if err != nil {
		t.Fatal(err)
	}
	if restored != "older version" {
		t.Fatalf("restored draft = %q, want %q", restored, "older version")
	}
	if !doc.Dirty {
		t.Fatal("restored document was not marked dirty")
	}

	after, err := store.ListHistory(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != 2 {
		t.Fatalf("history entries after restore = %d, want 2", len(after))
	}
	var protectedContent string
	for _, entry := range after {
		if entry.Source != "restore" {
			continue
		}
		protectedContent, err = store.GetSnapshotContent(doc.ID, entry.Timestamp)
		if err != nil {
			t.Fatal(err)
		}
		break
	}
	if protectedContent == "" {
		t.Fatal("restore did not create a protective history snapshot")
	}
	if protectedContent != "working changes" {
		t.Fatalf("protective snapshot = %q, want immediate pre-restore content %q", protectedContent, "working changes")
	}
}

func TestRestoreVersionRollsBackWhenSessionSaveFails(t *testing.T) {
	root := t.TempDir()
	store, err := session.NewStoreAt(root)
	if err != nil {
		t.Fatal(err)
	}
	doc := session.NewDocument("", "working changes")
	doc.ViewMode = "split"
	sess := &session.Session{
		ActiveID:  doc.ID,
		Documents: []*session.Document{doc},
	}
	if err := store.WriteDraft(doc, "working changes"); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveSnapshot(doc.ID, "older version", "save"); err != nil {
		t.Fatal(err)
	}
	entries, err := store.ListHistory(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("initial history entries = %d, want 1", len(entries))
	}

	// A directory at session.json makes only the final session replacement fail;
	// history and draft writes remain available for the rollback path.
	if err := os.Mkdir(filepath.Join(root, "session.json"), 0o700); err != nil {
		t.Fatal(err)
	}
	before := *doc
	app := &App{store: store, sess: sess}
	if _, err := app.RestoreVersion(doc.ID, entries[0].Timestamp); err == nil {
		t.Fatal("RestoreVersion succeeded when session persistence was blocked")
	} else if !strings.Contains(err.Error(), "save restored session") {
		t.Fatalf("RestoreVersion error = %q", err)
	}

	if !reflect.DeepEqual(*doc, before) {
		t.Fatalf("document changed after failed restore:\n got: %#v\nwant: %#v", *doc, before)
	}
	draft, err := store.ReadDraft(doc)
	if err != nil {
		t.Fatal(err)
	}
	if draft != "working changes" {
		t.Fatalf("draft after failed restore = %q, want pre-restore content", draft)
	}
	entries, err = store.ListHistory(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("history entries after failed restore = %d, want protective snapshot", len(entries))
	}
}

func TestDeleteNoteRemovesRecoveryDraft(t *testing.T) {
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	doc := session.NewDocument("", "discard me")
	sess := &session.Session{ActiveID: doc.ID, Documents: []*session.Document{doc}}
	if err := store.WriteDraft(doc, "discard me"); err != nil {
		t.Fatal(err)
	}
	draftPath := store.DraftPath(doc)

	app := &App{store: store, sess: sess}
	state := app.DeleteNote(doc.ID)
	if len(state.Notes) != 1 || state.Notes[0].ID == doc.ID {
		t.Fatalf("delete should replace the last note with one clean draft: %#v", state.Notes)
	}
	if _, err := os.Stat(draftPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("deleted draft still exists: stat error = %v", err)
	}
}
