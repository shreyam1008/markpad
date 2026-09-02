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
	want := canonicalPath(path)
	if got := canonicalPath(indirect); got != want {
		t.Fatalf("canonicalPath() = %q, want %q", got, want)
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

func TestResolveMarkdownAssetPath(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	markdownPath := filepath.Join(dir, "docs", "README.md")
	want := canonicalPath(filepath.Join(dir, "assets", "hero image.png"))
	got, err := resolveMarkdownAssetPath(markdownPath, "../assets/hero%20image.png?raw=1#preview")
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("resolveMarkdownAssetPath() = %q, want %q", got, want)
	}
}

func TestResolveMarkdownAssetPathRejectsRemoteAndNonImageSources(t *testing.T) {
	t.Parallel()

	markdownPath := filepath.Join(t.TempDir(), "README.md")
	for _, source := range []string{"https://example.com/hero.png", "data:image/png;base64,AA==", "//server/share.png", `/root.png`, `C:\\photo.png`, "notes.txt", "hero%2.png"} {
		if _, err := resolveMarkdownAssetPath(markdownPath, source); err == nil {
			t.Errorf("expected %q to be rejected", source)
		}
	}
}

func TestMarkdownImageMIMEType(t *testing.T) {
	t.Parallel()

	for path, want := range map[string]string{
		"photo.PNG":   "image/png",
		"photo.jpeg":  "image/jpeg",
		"diagram.svg": "image/svg+xml",
	} {
		if got := markdownImageMIMEType(path); got != want {
			t.Errorf("markdownImageMIMEType(%q) = %q, want %q", path, got, want)
		}
	}
}

func TestReadMarkdownAssetReturnsEmbeddableImageURL(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	markdownPath := filepath.Join(dir, "README.md")
	assetPath := filepath.Join(dir, "photo", "hero.png")
	if err := os.MkdirAll(filepath.Dir(assetPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(assetPath, []byte("png"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := (&App{}).ReadMarkdownAsset(markdownPath, "./photo/hero.png")
	if err != nil {
		t.Fatal(err)
	}
	if want := "data:image/png;base64,cG5n"; got != want {
		t.Fatalf("ReadMarkdownAsset() = %q, want %q", got, want)
	}
}

func TestReadMarkdownAssetRejectsOversizedEmbeddedImage(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	assetPath := filepath.Join(dir, "hero.png")
	file, err := os.Create(assetPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxMarkdownImageSize + 1); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := (&App{}).ReadMarkdownAsset(filepath.Join(dir, "README.md"), "hero.png"); err == nil {
		t.Fatal("expected an oversized embedded image to be rejected")
	}
}
