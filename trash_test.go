package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"markpad/internal/session"
)

func newTrashTestApp(t *testing.T) *App {
	t.Helper()
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return &App{store: store}
}

func writeTrashItemFile(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("trashed"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestListFileTrashIsReadOnly(t *testing.T) {
	app := newTrashTestApp(t)
	trashPath := filepath.Join(app.store.Root(), fileTrashDir, "expired.md")
	writeTrashItemFile(t, trashPath)
	state := fileTrashState{Items: []FileTrashItem{{
		ID:        "expired",
		Title:     "Expired",
		TrashPath: trashPath,
		DeletedAt: time.Now().AddDate(0, 0, -fileTrashDays-1),
	}}}
	if err := app.writeFileTrashState(state); err != nil {
		t.Fatal(err)
	}

	items := app.ListFileTrash()
	if len(items) != 1 {
		t.Fatalf("ListFileTrash returned %d items, want 1", len(items))
	}
	if _, err := os.Stat(trashPath); err != nil {
		t.Fatalf("ListFileTrash removed trash file: %v", err)
	}
}

func TestCleanupExpiredFileTrashRemovesExpiredItems(t *testing.T) {
	app := newTrashTestApp(t)
	expiredPath := filepath.Join(app.store.Root(), fileTrashDir, "expired.md")
	freshPath := filepath.Join(app.store.Root(), fileTrashDir, "fresh.md")
	writeTrashItemFile(t, expiredPath)
	writeTrashItemFile(t, freshPath)
	state := fileTrashState{Items: []FileTrashItem{
		{ID: "expired", Title: "Expired", TrashPath: expiredPath, DeletedAt: time.Now().AddDate(0, 0, -fileTrashDays-1)},
		{ID: "fresh", Title: "Fresh", TrashPath: freshPath, DeletedAt: time.Now()},
	}}
	if err := app.writeFileTrashState(state); err != nil {
		t.Fatal(err)
	}

	result := app.CleanupExpiredFileTrash()
	if result.Removed != 1 || len(result.Remaining) != 1 || result.Remaining[0].ID != "fresh" {
		t.Fatalf("cleanup result = removed %d remaining %#v, want expired removed and fresh retained", result.Removed, result.Remaining)
	}
	if _, err := os.Stat(expiredPath); !os.IsNotExist(err) {
		t.Fatalf("expired trash file still exists or stat failed unexpectedly: %v", err)
	}
	if _, err := os.Stat(freshPath); err != nil {
		t.Fatalf("fresh trash file missing: %v", err)
	}
}

func TestCleanupExpiredFileTrashPrunesMissingFiles(t *testing.T) {
	app := newTrashTestApp(t)
	missingPath := filepath.Join(app.store.Root(), fileTrashDir, "missing.md")
	state := fileTrashState{Items: []FileTrashItem{{
		ID:        "missing",
		Title:     "Missing",
		TrashPath: missingPath,
		DeletedAt: time.Now(),
	}}}
	if err := app.writeFileTrashState(state); err != nil {
		t.Fatal(err)
	}

	result := app.CleanupExpiredFileTrash()
	if result.Removed != 1 || len(result.Remaining) != 0 {
		t.Fatalf("cleanup missing result = removed %d remaining %d, want removed 1 remaining 0", result.Removed, len(result.Remaining))
	}
}

func TestCleanupExpiredFileTrashKeepsUnremovableEntries(t *testing.T) {
	app := newTrashTestApp(t)
	dirPath := filepath.Join(app.store.Root(), fileTrashDir, "not-a-file")
	if err := os.MkdirAll(dirPath, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dirPath, "child"), []byte("blocked"), 0o644); err != nil {
		t.Fatal(err)
	}
	state := fileTrashState{Items: []FileTrashItem{{
		ID:        "blocked",
		Title:     "Blocked",
		TrashPath: dirPath,
		DeletedAt: time.Now().AddDate(0, 0, -fileTrashDays-1),
	}}}
	if err := app.writeFileTrashState(state); err != nil {
		t.Fatal(err)
	}

	result := app.CleanupExpiredFileTrash()
	if result.Removed != 0 || len(result.Remaining) != 1 || result.Remaining[0].ID != "blocked" {
		t.Fatalf("cleanup blocked result = removed %d remaining %#v, want blocked entry retained", result.Removed, result.Remaining)
	}
}
