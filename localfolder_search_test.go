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

func TestSearchLocalFolderSupportsExclusions(t *testing.T) {
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	folder := t.TempDir()
	app := &App{store: store}
	if err := app.writeLocalFolderSettings(localFolderSettings{DefaultFolder: folder}); err != nil {
		t.Fatal(err)
	}

	files := map[string]string{
		"keep.md":             "alpha launch #focus\n- [ ] ship search\n",
		"archive.md":          "alpha archived #focus\n- [x] done search\n",
		"blocked.md":          "alpha launch #blocked\n- [ ] blocked task\n",
		"done.md":             "alpha launch #focus\n- [x] completed task\n",
		"phrase.md":           "alpha launch skip me\n- [ ] phrase task\n",
		"archive/inside.md":   "alpha launch #focus\n- [ ] nested archived task\n",
		"notes/unrelated.txt": "alpha launch should not be markdown\n",
	}
	for name, content := range files {
		path := filepath.Join(folder, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	cases := []struct {
		query   string
		absent  []string
		present []string
	}{
		{query: "alpha -archived", absent: []string{"archive.md", "archive/inside.md"}, present: []string{"keep.md"}},
		{query: "alpha -path:archive", absent: []string{"archive.md", "archive/inside.md"}, present: []string{"keep.md"}},
		{query: "alpha -#blocked", absent: []string{"blocked.md"}, present: []string{"keep.md"}},
		{query: "alpha -task:done", absent: []string{"archive.md", "done.md"}, present: []string{"keep.md"}},
		{query: "alpha -\"skip me\"", absent: []string{"phrase.md"}, present: []string{"keep.md"}},
	}

	for _, tc := range cases {
		result := app.SearchLocalFolderWithStats(tc.query, 20)
		paths := make(map[string]bool, len(result.Hits))
		for _, hit := range result.Hits {
			paths[hit.RelPath] = true
		}
		for _, rel := range tc.absent {
			if paths[rel] {
				t.Fatalf("query %q returned excluded path %q in %#v", tc.query, rel, paths)
			}
		}
		for _, rel := range tc.present {
			if !paths[rel] {
				t.Fatalf("query %q did not return expected path %q in %#v", tc.query, rel, paths)
			}
		}
	}
}
