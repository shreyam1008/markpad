package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"markpad/internal/session"
)

func switchPersistenceApp(t *testing.T, content string, saved bool) (*App, *session.Document) {
	t.Helper()
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	sess := &session.Session{}
	var doc *session.Document
	if saved {
		path := filepath.Join(t.TempDir(), "note.md")
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		doc = sess.AddFile(path, content)
	} else {
		doc = session.NewDocument("", content)
		sess.Add(doc)
	}
	doc.UpdatedAt = time.Date(2000, 1, 2, 3, 4, 5, 0, time.UTC)
	if err := store.WriteDraft(doc, content); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(sess); err != nil {
		t.Fatal(err)
	}
	return &App{store: store, sess: sess}, doc
}

func stampPersistenceFile(t *testing.T, path string) time.Time {
	t.Helper()
	stamp := time.Date(2001, 2, 3, 4, 5, 6, 0, time.UTC)
	if err := os.Chtimes(path, stamp, stamp); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	return info.ModTime()
}

func assertPersistenceFileUnchanged(t *testing.T, path string, stamp time.Time) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if !info.ModTime().Equal(stamp) {
		t.Fatalf("unchanged persistence file was replaced: %s", path)
	}
}

func TestIdenticalSwitchUpdatesDoNotRewriteRecovery(t *testing.T) {
	t.Parallel()
	for _, saved := range []bool{false, true} {
		for _, dirty := range []bool{false, true} {
			name := "draft"
			if saved {
				name = "saved"
			}
			if dirty {
				name += "-dirty"
			}
			t.Run(name, func(t *testing.T) {
				const content = "# A note\r\n\r\nKeep this exact text.\r\n"
				app, doc := switchPersistenceApp(t, content, saved)
				doc.Dirty = dirty
				if err := app.store.Save(app.sess); err != nil {
					t.Fatal(err)
				}
				draftPath := app.store.DraftPath(doc)
				sessionPath := filepath.Join(app.store.Root(), "session.json")
				draftStamp := stampPersistenceFile(t, draftPath)
				sessionStamp := stampPersistenceFile(t, sessionPath)
				updated := doc.UpdatedAt
				for range 3 {
					if err := app.UpdateContent(doc.ID, content, dirty); err != nil {
						t.Fatal(err)
					}
					if err := app.UpdateReadPosition(doc.ID, 0, 0, 0); err != nil {
						t.Fatal(err)
					}
				}
				assertPersistenceFileUnchanged(t, draftPath, draftStamp)
				assertPersistenceFileUnchanged(t, sessionPath, sessionStamp)
				if !doc.UpdatedAt.Equal(updated) {
					t.Fatal("reading an unchanged note changed its update timestamp")
				}
			})
		}
	}
}

func TestIdenticalDraftStillPersistsDirtyTransitions(t *testing.T) {
	t.Parallel()
	app, doc := switchPersistenceApp(t, "unchanged", true)
	draftPath := app.store.DraftPath(doc)
	stamp := stampPersistenceFile(t, draftPath)
	for _, dirty := range []bool{true, false} {
		// MarkDirty is a separate bridge call and does not persist metadata.
		app.MarkDirty(doc.ID)
		if err := app.UpdateContent(doc.ID, "unchanged", dirty); err != nil {
			t.Fatal(err)
		}
		loaded, err := app.store.Load()
		if err != nil {
			t.Fatal(err)
		}
		if loaded.Find(doc.ID).Dirty != dirty {
			t.Fatalf("recovered dirty state = %v, want %v", loaded.Find(doc.ID).Dirty, dirty)
		}
		assertPersistenceFileUnchanged(t, draftPath, stamp)
	}
}

func TestSwitchPositionChangePersistsAndDuplicateDoesNotRewrite(t *testing.T) {
	t.Parallel()
	app, doc := switchPersistenceApp(t, "position", true)
	if err := app.UpdateReadPosition(doc.ID, 100, 250, 7); err != nil {
		t.Fatal(err)
	}
	loaded, err := app.store.Load()
	if err != nil {
		t.Fatal(err)
	}
	position := loaded.Find(doc.ID)
	if position.ScrollTop != 100 || position.ViewTop != 250 || position.Cursor != 7 {
		t.Fatalf("position was not recovered: %#v", position)
	}
	path := filepath.Join(app.store.Root(), "session.json")
	stamp := stampPersistenceFile(t, path)
	if err := app.UpdateReadPosition(doc.ID, 100, 250, 7); err != nil {
		t.Fatal(err)
	}
	assertPersistenceFileUnchanged(t, path, stamp)
}

func TestIdenticalContentRecreatesMissingDraftWithoutReadingExternalSource(t *testing.T) {
	t.Parallel()
	app, doc := switchPersistenceApp(t, "opened content", true)
	baseline := *doc.SourceState
	if err := os.WriteFile(doc.Path, []byte("external edit"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(app.store.DraftPath(doc)); err != nil {
		t.Fatal(err)
	}
	if err := app.UpdateContent(doc.ID, "opened content", false); err != nil {
		t.Fatal(err)
	}
	draft, err := os.ReadFile(app.store.DraftPath(doc))
	if err != nil || string(draft) != "opened content" {
		t.Fatalf("missing recovery draft not recreated: %q, %v", draft, err)
	}
	source, err := os.ReadFile(doc.Path)
	if err != nil || string(source) != "external edit" {
		t.Fatalf("external source was modified: %q, %v", source, err)
	}
	if *doc.SourceState != baseline {
		t.Fatal("draft update changed the external-modification baseline")
	}
	result, err := app.SaveActive("opened content", false)
	if err != nil || result.Conflict == nil {
		t.Fatalf("external save conflict was lost: %#v, %v", result, err)
	}
}

func TestMissingDraftIsRecreatedEvenWhenSavedSourceMatches(t *testing.T) {
	t.Parallel()
	for _, content := range []string{"", "same as the saved source"} {
		t.Run(content, func(t *testing.T) {
			app, doc := switchPersistenceApp(t, content, true)
			path := app.store.DraftPath(doc)
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
			// ReadDraft's fallback would compare equal here, but recovery is absent.
			if err := app.UpdateContent(doc.ID, content, false); err != nil {
				t.Fatal(err)
			}
			actual, err := os.ReadFile(path)
			if err != nil || string(actual) != content {
				t.Fatalf("matching saved source prevented draft recreation: %q, %v", actual, err)
			}
		})
	}
}

func TestUpdateContentFailureRejectsAndIdenticalRetryPersists(t *testing.T) {
	t.Parallel()
	for _, failDraft := range []bool{true, false} {
		name := "session"
		if failDraft {
			name = "draft"
		}
		t.Run(name, func(t *testing.T) {
			app, doc := switchPersistenceApp(t, "old text", true)
			blocked := filepath.Join(app.store.Root(), "session.json")
			if failDraft {
				blocked = app.store.DraftPath(doc)
			}
			if err := os.Remove(blocked); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(blocked, 0o700); err != nil {
				t.Fatal(err)
			}
			if err := app.UpdateContent(doc.ID, "new recovery text", true); err == nil {
				t.Fatal("failed recovery write was acknowledged")
			}
			if err := os.Remove(blocked); err != nil {
				t.Fatal(err)
			}
			if err := app.UpdateContent(doc.ID, "new recovery text", true); err != nil {
				t.Fatal(err)
			}
			loaded, err := app.store.Load()
			if err != nil {
				t.Fatal(err)
			}
			if !loaded.Find(doc.ID).Dirty {
				t.Fatal("successful retry did not recover the dirty flag")
			}
			draft, err := app.store.ReadDraft(loaded.Find(doc.ID))
			if err != nil || draft != "new recovery text" {
				t.Fatalf("successful retry did not recover content: %q, %v", draft, err)
			}
		})
	}
}

func TestUpdateReadPositionFailureRejectsAndIdenticalRetryPersists(t *testing.T) {
	t.Parallel()
	app, doc := switchPersistenceApp(t, "position", true)
	path := filepath.Join(app.store.Root(), "session.json")
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := app.UpdateReadPosition(doc.ID, 12, 34, 5); err == nil {
		t.Fatal("failed position save was acknowledged")
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := app.UpdateReadPosition(doc.ID, 12, 34, 5); err != nil {
		t.Fatal(err)
	}
	loaded, err := app.store.Load()
	if err != nil {
		t.Fatal(err)
	}
	position := loaded.Find(doc.ID)
	if position.ScrollTop != 12 || position.ViewTop != 34 || position.Cursor != 5 {
		t.Fatalf("identical retry lost positions: %#v", position)
	}
}

func TestIdenticalContentRefreshesTaskIdentityAfterFormatChange(t *testing.T) {
	t.Parallel()
	const content = "<!-- quillpane:tasks -->\n# Tasks\n"
	app, doc := switchPersistenceApp(t, content, false)
	if !doc.TaskBoard {
		t.Fatal("fixture is not a task board")
	}
	stamp := stampPersistenceFile(t, app.store.DraftPath(doc))
	doc.Format = "txt"
	if err := app.UpdateContent(doc.ID, content, doc.Dirty); err != nil {
		t.Fatal(err)
	}
	if doc.TaskBoard {
		t.Fatal("unchanged content kept the stale Markdown task identity")
	}
	assertPersistenceFileUnchanged(t, app.store.DraftPath(doc), stamp)
}

func TestUnchangedLargeDraftComparisonIsExactAcrossBufferBoundaries(t *testing.T) {
	t.Parallel()
	content := strings.Repeat("x", 8192) + "end"
	app, doc := switchPersistenceApp(t, content, true)
	path := app.store.DraftPath(doc)
	stamp := stampPersistenceFile(t, path)
	if err := app.UpdateContent(doc.ID, content, doc.Dirty); err != nil {
		t.Fatal(err)
	}
	assertPersistenceFileUnchanged(t, path, stamp)
	// Same byte count, with a difference after more than one comparison buffer.
	changed := content[:8192] + "new"
	if err := app.UpdateContent(doc.ID, changed, true); err != nil {
		t.Fatal(err)
	}
	actual, err := os.ReadFile(path)
	if err != nil || string(actual) != changed {
		t.Fatalf("equal-size changed draft was skipped: %q, %v", actual, err)
	}
}
