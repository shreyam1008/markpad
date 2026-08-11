package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAllowedExternalURL(t *testing.T) {
	t.Parallel()

	allowed := []string{
		"https://example.com/note",
		"http://localhost:8080",
		"mailto:hello@example.com",
	}
	for _, value := range allowed {
		if !isAllowedExternalURL(value) {
			t.Errorf("expected %q to be allowed", value)
		}
	}

	blocked := []string{
		"",
		"example.com",
		"file:///tmp/private.txt",
		"javascript:alert(1)",
		"data:text/html,unsafe",
	}
	for _, value := range blocked {
		if isAllowedExternalURL(value) {
			t.Errorf("expected %q to be blocked", value)
		}
	}
}

func TestCanonicalPathResolvesEquivalentPaths(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "note.md")
	if err := os.WriteFile(path, []byte("note"), 0o600); err != nil {
		t.Fatal(err)
	}

	indirect := filepath.Join(dir, ".", "folder", "..", "note.md")
	if got := canonicalPath(indirect); got != path {
		t.Fatalf("canonicalPath() = %q, want %q", got, path)
	}
}

func TestReadOpenFileEnforcesEditableLimit(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "large.md")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxEditableFileSize + 1); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	if _, err := readOpenFile(path); err == nil {
		t.Fatal("expected oversized editable file to be rejected")
	}
}

func TestReadOpenFileAllowsReadOnlyAssetBudget(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "document.pdf")
	content := []byte("%PDF-1.7\n")
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := readOpenFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(content) {
		t.Fatalf("readOpenFile() = %q, want %q", got, content)
	}
}
