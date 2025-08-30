package tests

import (
	"os"
	"path/filepath"
	"testing"

	"markpad/internal/session"
)

func TestSessionRestoreWithBookmarksPreferencesAndDrafts(t *testing.T) {
	root := t.TempDir()
	store, err := session.NewStoreAt(root)
	if err != nil {
		t.Fatal(err)
	}
	sourcePath := filepath.Join(t.TempDir(), "plan.txt")
	if err := os.WriteFile(sourcePath, []byte("plain text note\nsecond line"), 0o644); err != nil {
		t.Fatal(err)
	}

	sess, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	doc := sess.AddFile(sourcePath, "plain text note\nsecond line")
	note := session.NewDocument("", "# Draft\n\nunsaved")
	sess.Add(note)
	sess.BookmarkFile(sourcePath, "plain text note\nsecond line")
	sess.Preferences.CompactMode = true
	sess.Preferences.ReducedMotion = true

	if err := store.WriteDraft(note, "# Draft\n\nkept only in config"); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(sess); err != nil {
		t.Fatal(err)
	}

	loaded, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Documents) != 3 {
		t.Fatalf("documents = %d, want 3", len(loaded.Documents))
	}
	if loaded.Find(doc.ID) == nil {
		t.Fatalf("saved file document %q missing after restore", doc.ID)
	}
	if loaded.FindBookmark(sourcePath) == nil {
		t.Fatal("bookmark missing after restore")
	}
	if !loaded.Preferences.CompactMode || !loaded.Preferences.ReducedMotion {
		t.Fatalf("preferences not restored: %#v", loaded.Preferences)
	}

	draft, err := store.ReadDraft(loaded.Find(note.ID))
	if err != nil {
		t.Fatal(err)
	}
	if draft != "# Draft\n\nkept only in config" {
		t.Fatalf("draft = %q", draft)
	}
}

func TestBookmarkToggleDeduplicatesByAbsolutePath(t *testing.T) {
	sess := &session.Session{}
	path := filepath.Join(t.TempDir(), "note.md")
	if err := os.WriteFile(path, []byte("# Note"), 0o644); err != nil {
		t.Fatal(err)
	}

	if !sess.ToggleBookmark(path, "# Note") {
		t.Fatal("first toggle should add bookmark")
	}
	if len(sess.Bookmarks) != 1 {
		t.Fatalf("bookmarks = %d, want 1", len(sess.Bookmarks))
	}
	if sess.ToggleBookmark(path, "# Note") {
		t.Fatal("second toggle should remove bookmark")
	}
	if len(sess.Bookmarks) != 0 {
		t.Fatalf("bookmarks = %d, want 0", len(sess.Bookmarks))
	}

	sess.BookmarkFile(path, "# Note")
	sess.BookmarkFile(filepath.Clean(path), "# Note edited")
	if len(sess.Bookmarks) != 1 {
		t.Fatalf("duplicate bookmark inserted, got %d", len(sess.Bookmarks))
	}
	if sess.Bookmarks[0].Title != "note.md" {
		t.Fatalf("bookmark title = %q", sess.Bookmarks[0].Title)
	}
}

func TestPlainTextAndMarkdownTitles(t *testing.T) {
	tests := []struct {
		name    string
		path    string
		content string
		want    string
	}{
		{name: "markdown heading", path: "note.md", content: "# Project\n\nBody", want: "note.md"},
		{name: "plain first line", path: "note.txt", content: "todo list\n- one", want: "note.txt"},
		{name: "path fallback", path: "meeting-notes.txt", content: "\n\n", want: "meeting-notes.txt"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := session.TitleFromContent(tt.content, tt.path); got != tt.want {
				t.Fatalf("TitleFromContent = %q, want %q", got, tt.want)
			}
		})
	}
}
