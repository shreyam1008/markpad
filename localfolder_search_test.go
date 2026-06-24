package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"markpad/internal/session"
)

func TestSearchLocalFolderWithStatsSkipsOversizeAndCapsResults(t *testing.T) {
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	folder := t.TempDir()
	app := &App{store: store}
	if err := app.writeLocalFolderSettings(localFolderSettings{DefaultFolder: folder}); err != nil {
		t.Fatal(err)
	}

	for i := 0; i < 3; i++ {
		path := filepath.Join(folder, fmt.Sprintf("match-%d.md", i))
		if err := os.WriteFile(path, []byte("alpha budget-safe search hit\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	oversizePath := filepath.Join(folder, "oversize.md")
	oversize, err := os.Create(oversizePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := oversize.Truncate(int64(localFolderSearchCap + 1)); err != nil {
		_ = oversize.Close()
		t.Fatal(err)
	}
	if err := oversize.Close(); err != nil {
		t.Fatal(err)
	}

	result := app.SearchLocalFolderWithStats("alpha", 2)

	if result.Limit != 2 {
		t.Fatalf("Limit = %d, want 2", result.Limit)
	}
	if len(result.Hits) != 2 {
		t.Fatalf("hits = %d, want 2", len(result.Hits))
	}
	if !result.Capped {
		t.Fatal("result should be marked capped when candidates exceed limit")
	}
	if result.Scanned != 4 {
		t.Fatalf("Scanned = %d, want 4", result.Scanned)
	}
	if result.Searchable != 3 {
		t.Fatalf("Searchable = %d, want 3", result.Searchable)
	}
	if result.Skipped != 1 {
		t.Fatalf("Skipped = %d, want 1", result.Skipped)
	}
	if result.Oversize != 1 {
		t.Fatalf("Oversize = %d, want 1", result.Oversize)
	}
	if result.Candidates != 3 {
		t.Fatalf("Candidates = %d, want 3", result.Candidates)
	}
	for _, hit := range result.Hits {
		if hit.RelPath == "oversize.md" {
			t.Fatal("oversize file appeared in search hits")
		}
	}
}
