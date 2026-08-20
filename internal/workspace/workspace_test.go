package workspace

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestScanFiltersAndSorts(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeTestFile(t, root, "z-note.md", "visible")
	writeTestFile(t, root, "A-note.txt", "visible")
	writeTestFile(t, root, "README", "extensionless text")
	writeTestFile(t, root, ".hidden.md", "hidden")
	writeTestFile(t, root, ".secret/note.md", "hidden directory")
	writeTestFile(t, root, "node_modules/dependency.md", "excluded")
	writeTestFile(t, root, "vendor/package.md", "excluded")
	writeTestFile(t, root, "unsupported.bin", "not supported")
	writeTestFile(t, root, "binary.md", "text\x00binary")

	large := filepath.Join(root, "large.md")
	file, err := os.Create(large)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(MaxFileSize + 1); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(filepath.Join(root, "z-note.md"), filepath.Join(root, "linked.md")); err != nil {
		t.Logf("symlink coverage skipped: %v", err)
	}

	state, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	got := make([]string, 0, len(state.Files))
	for _, file := range state.Files {
		got = append(got, fmt.Sprintf("%s:%s", file.Relative, file.Kind))
	}
	want := []string{"A-note.txt:text", "README:text", "z-note.md:markdown"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("Scan() files = %v, want %v", got, want)
	}
	if state.Truncated {
		t.Fatal("small workspace should not be truncated")
	}
}

func TestScanDepthCap(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	relative := ""
	for index := 0; index < MaxDepth+2; index++ {
		relative = filepath.Join(relative, fmt.Sprintf("d%02d", index))
	}
	writeTestFile(t, root, filepath.Join(relative, "too-deep.md"), "needle")

	state, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	if !state.Truncated {
		t.Fatal("depth-limited scan should report truncation")
	}
	if len(state.Files) != 0 {
		t.Fatalf("depth-limited scan returned %d files", len(state.Files))
	}
}

func TestScanFileCountCap(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for index := 0; index < 4; index++ {
		writeTestFile(t, root, fmt.Sprintf("note-%d.md", index), "content")
	}

	state, err := scan(root, scanLimits{files: 2, entries: 100, depth: MaxDepth})
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Files) != 2 || !state.Truncated {
		t.Fatalf("file-capped scan = %d files, truncated %v", len(state.Files), state.Truncated)
	}
}

func TestSearchUnicodeCoordinatesAndOverrides(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	path := writeTestFile(t, root, "notes/unicode.md", "first line\n😀 café Needle here\nlast")
	state, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}

	results, err := Search(context.Background(), state, "needle", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("Search() returned %d results, want 1", len(results))
	}
	result := results[0]
	if result.Line != 2 || result.Column != 8 {
		t.Fatalf("Search() coordinate = %d:%d, want 2:8", result.Line, result.Column)
	}
	if result.Text != "😀 café Needle here" || result.MatchStart != 8 || result.MatchEnd != 14 {
		t.Fatalf("Search() highlight = %q [%d:%d]", result.Text, result.MatchStart, result.MatchEnd)
	}

	overrides := map[string][]byte{path: []byte("😀 changed only in DRAFT")}
	results, err = Search(context.Background(), state, "draft", overrides)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Column != 19 {
		t.Fatalf("draft Search() = %#v", results)
	}
	results, err = Search(context.Background(), state, "needle", overrides)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("disk content leaked through draft override: %#v", results)
	}
}

func TestSearchCapsAndCancellation(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	lines := strings.Repeat("needle\n", MaxSearchResults+20)
	writeTestFile(t, root, "many.md", lines)
	state, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}

	results, err := Search(context.Background(), state, "needle", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != MaxSearchResults {
		t.Fatalf("Search() returned %d results, want cap %d", len(results), MaxSearchResults)
	}
	_, err = Search(context.Background(), state, strings.Repeat("x", MaxSearchQueryRunes+1), nil)
	if err == nil {
		t.Fatal("expected oversized query to be rejected")
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = Search(cancelled, state, "needle", nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Search() cancellation error = %v", err)
	}
}

func TestCreateFileSafetyAndCollision(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	outside := filepath.Join(filepath.Dir(root), "escape.md")

	tests := []struct {
		name string
		path string
	}{
		{name: "parent escape", path: "../escape.md"},
		{name: "nested escape", path: "notes/../../escape.md"},
		{name: "absolute", path: outside},
		{name: "hidden", path: ".private.md"},
		{name: "excluded", path: "node_modules/note.md"},
		{name: "unsupported", path: "note.go"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if _, err := CreateFile(root, test.path); err == nil {
				t.Fatalf("CreateFile(%q) unexpectedly succeeded", test.path)
			}
		})
	}

	path, err := CreateFile(root, "notes/quick")
	if err != nil {
		t.Fatal(err)
	}
	if path != filepath.Join(root, "notes", "quick.md") {
		t.Fatalf("CreateFile() = %q", path)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateFile(root, "notes/quick.md"); err == nil {
		t.Fatal("expected collision to be rejected")
	}
	if _, err := os.Stat(outside); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("escape target status = %v", err)
	}
}

func TestCreateAndValidateRejectSymlinks(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	outside := t.TempDir()
	link := filepath.Join(root, "linked")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if _, err := CreateFile(root, "linked/escape.md"); err == nil {
		t.Fatal("expected create through symlink to fail")
	}
	outsideFile := writeTestFile(t, outside, "outside.md", "content")
	if _, err := ValidateMember(root, filepath.Join(link, "outside.md")); err == nil {
		t.Fatal("expected symlink member to be rejected")
	}
	if _, err := ValidateDeleteTarget(filepath.Join(link, "outside.md")); err == nil {
		t.Fatal("expected symlink delete target to be rejected")
	}
	if _, err := os.Stat(outsideFile); err != nil {
		t.Fatal("outside file was altered")
	}
}

func BenchmarkSearch(b *testing.B) {
	root := b.TempDir()
	for fileIndex := 0; fileIndex < 250; fileIndex++ {
		var content strings.Builder
		for lineIndex := 0; lineIndex < 80; lineIndex++ {
			fmt.Fprintf(&content, "document %03d line %03d has ordinary workspace text\n", fileIndex, lineIndex)
		}
		if fileIndex == 249 {
			content.WriteString("representative benchmark needle\n")
		}
		path := filepath.Join(root, fmt.Sprintf("folder-%02d", fileIndex%10), fmt.Sprintf("note-%03d.md", fileIndex))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			b.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content.String()), 0o600); err != nil {
			b.Fatal(err)
		}
	}
	state, err := Scan(root)
	if err != nil {
		b.Fatal(err)
	}

	b.ReportAllocs()
	b.SetBytes(int64(250 * 80 * 50))
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		results, err := Search(context.Background(), state, "benchmark needle", nil)
		if err != nil {
			b.Fatal(err)
		}
		if len(results) != 1 {
			b.Fatalf("Search() returned %d results", len(results))
		}
	}
}

func writeTestFile(t testing.TB, root string, relative string, content string) string {
	t.Helper()
	path := filepath.Join(root, relative)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
