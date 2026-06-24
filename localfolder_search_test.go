package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

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

func TestSearchLocalFolderRanksMetadataAndReturnsHitMetadata(t *testing.T) {
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
		"Project Alpha.md":              "planning note without the query in the body\n",
		"body.md":                       "intro\n" + strings.Repeat("before ", 40) + "alpha target context " + strings.Repeat("after ", 40) + "\n",
		"notes/team-alpha-reference.md": "nested path metadata\n",
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

	result := app.SearchLocalFolderWithStats("alpha", 10)
	if len(result.Hits) < 2 {
		t.Fatalf("hits = %d, want at least 2", len(result.Hits))
	}
	if result.Hits[0].RelPath != "Project Alpha.md" {
		t.Fatalf("top hit = %q, want Project Alpha.md; hits=%#v", result.Hits[0].RelPath, result.Hits)
	}
	if result.Hits[0].MatchKind != "path" {
		t.Fatalf("top MatchKind = %q, want path", result.Hits[0].MatchKind)
	}
	if result.Hits[0].Size == 0 {
		t.Fatal("top hit Size should be populated")
	}
	if result.Hits[0].Modified == "" {
		t.Fatal("top hit Modified should be populated")
	}

	var bodyHit LocalFolderSearchHit
	for _, hit := range result.Hits {
		if hit.RelPath == "body.md" {
			bodyHit = hit
			break
		}
	}
	if bodyHit.RelPath == "" {
		t.Fatalf("body.md was not returned in hits %#v", result.Hits)
	}
	if bodyHit.MatchKind != "content" {
		t.Fatalf("body MatchKind = %q, want content", bodyHit.MatchKind)
	}
	if bodyHit.Line != 1 {
		t.Fatalf("body Line = %d, want 1", bodyHit.Line)
	}
	if !strings.Contains(bodyHit.Snippet, "alpha target context") {
		t.Fatalf("body Snippet = %q, want match context", bodyHit.Snippet)
	}
	if len(bodyHit.Snippet) >= len(files["body.md"]) {
		t.Fatalf("body Snippet was not trimmed: got length %d, full length %d", len(bodyHit.Snippet), len(files["body.md"]))
	}
}

func TestSearchLocalFolderFilterOnlyMatchKind(t *testing.T) {
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	folder := t.TempDir()
	app := &App{store: store}
	if err := app.writeLocalFolderSettings(localFolderSettings{DefaultFolder: folder}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "alpha.md"), []byte("plain note\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	result := app.SearchLocalFolderWithStats("type:md", 10)
	if len(result.Hits) != 1 {
		t.Fatalf("hits = %d, want 1", len(result.Hits))
	}
	if result.Hits[0].MatchKind != "filter" {
		t.Fatalf("MatchKind = %q, want filter", result.Hits[0].MatchKind)
	}
	if result.Hits[0].Snippet != "alpha.md" {
		t.Fatalf("Snippet = %q, want alpha.md", result.Hits[0].Snippet)
	}
}

func TestSearchLocalFolderDropsStaleOverlappingSearch(t *testing.T) {
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	folder := t.TempDir()
	app := &App{store: store}
	if err := app.writeLocalFolderSettings(localFolderSettings{DefaultFolder: folder}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "alpha.md"), []byte("alpha first search\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "beta.md"), []byte("beta latest search\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	baseSearchID := localFolderSearches.currentID()
	firstScanning := make(chan struct{})
	releaseFirst := make(chan struct{})
	var firstScanningOnce sync.Once
	var releaseOnce sync.Once
	previousHook := localFolderSearchTestYieldHook
	localFolderSearchTestYieldHook = func() {
		firstScanningOnce.Do(func() {
			close(firstScanning)
			<-releaseFirst
		})
	}
	t.Cleanup(func() {
		localFolderSearchTestYieldHook = previousHook
		releaseOnce.Do(func() {
			close(releaseFirst)
		})
	})

	firstDone := make(chan LocalFolderSearchResult, 1)
	go func() {
		firstDone <- app.SearchLocalFolderWithStats("alpha", 10)
	}()
	select {
	case <-firstScanning:
	case <-time.After(2 * time.Second):
		t.Fatal("first search did not start scanning")
	}

	secondDone := make(chan LocalFolderSearchResult, 1)
	go func() {
		secondDone <- app.SearchLocalFolderWithStats("beta", 10)
	}()
	deadline := time.Now().Add(2 * time.Second)
	for localFolderSearches.currentID() < baseSearchID+2 {
		if time.Now().After(deadline) {
			t.Fatal("second search did not supersede first search")
		}
		time.Sleep(time.Millisecond)
	}
	releaseOnce.Do(func() {
		close(releaseFirst)
	})

	var first LocalFolderSearchResult
	select {
	case first = <-firstDone:
	case <-time.After(2 * time.Second):
		t.Fatal("first search did not finish")
	}
	if len(first.Hits) != 0 {
		t.Fatalf("stale first search returned %d hits, want 0", len(first.Hits))
	}

	var second LocalFolderSearchResult
	select {
	case second = <-secondDone:
	case <-time.After(2 * time.Second):
		t.Fatal("second search did not finish")
	}
	if len(second.Hits) != 1 {
		t.Fatalf("latest search hits = %d, want 1", len(second.Hits))
	}
	if second.Hits[0].RelPath != "beta.md" {
		t.Fatalf("latest search hit = %q, want beta.md", second.Hits[0].RelPath)
	}
}
