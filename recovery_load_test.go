package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"markpad/internal/session"
)

func TestContentLoadsRepairMissingRecoveryBeforeAcknowledging(t *testing.T) {
	t.Parallel()
	for _, saved := range []bool{false, true} {
		for _, content := range []string{"", "# Saved\r\n\r\nExact source.\r\n"} {
			if !saved && content != "" {
				continue // There is no saved fallback for a missing unsaved draft.
			}
			app, doc := switchPersistenceApp(t, content, saved)
			draftPath := app.store.DraftPath(doc)
			updated, dirty := doc.UpdatedAt, doc.Dirty
			for _, load := range []func() (string, error){
				app.GetActiveContent,
				func() (string, error) { return app.GetNoteContent(doc.ID) },
			} {
				if err := os.Remove(draftPath); err != nil {
					t.Fatal(err)
				}
				got, err := load()
				if err != nil || got != content {
					t.Fatalf("load = %q, %v; want %q", got, err, content)
				}
				draft, err := os.ReadFile(draftPath)
				if err != nil || string(draft) != got {
					t.Fatalf("acknowledged content has no matching recovery: %q, %v", draft, err)
				}
				stamp := stampPersistenceFile(t, draftPath)
				for range 3 {
					if _, err := load(); err != nil {
						t.Fatal(err)
					}
					if err := app.SetActive(doc.ID); err != nil {
						t.Fatal(err)
					}
				}
				assertPersistenceFileUnchanged(t, draftPath, stamp)
				if doc.UpdatedAt != updated || doc.Dirty != dirty {
					t.Fatal("load-time repair changed dirty state or update time")
				}
			}
		}
	}
}

func TestRecoveryLoadPreservesDirtyDraftAndExternalConflict(t *testing.T) {
	t.Parallel()
	app, doc := switchPersistenceApp(t, "saved version", true)
	baseline := *doc.SourceState
	const dirtyContent = "unsaved recovery must win"
	if err := app.UpdateContent(doc.ID, dirtyContent, true); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(doc.Path, []byte("changed outside Quillpane"), 0o600); err != nil {
		t.Fatal(err)
	}
	stamp := stampPersistenceFile(t, app.store.DraftPath(doc))
	for _, load := range []func() (string, error){
		app.GetActiveContent,
		func() (string, error) { return app.GetNoteContent(doc.ID) },
	} {
		got, err := load()
		if err != nil || got != dirtyContent {
			t.Fatalf("dirty recovery replaced during load: %q, %v", got, err)
		}
	}
	if err := app.SetActive(doc.ID); err != nil {
		t.Fatal(err)
	}
	assertPersistenceFileUnchanged(t, app.store.DraftPath(doc), stamp)
	if !doc.Dirty || *doc.SourceState != baseline {
		t.Fatal("loading changed recovery dirty state or source baseline")
	}
	result, err := app.SaveActive(dirtyContent, false)
	if err != nil || result.Conflict == nil {
		t.Fatalf("loading lost external conflict: %#v, %v", result, err)
	}
}

func TestMissingRecoveryRepairDoesNotAdoptExternalSourceBaseline(t *testing.T) {
	t.Parallel()
	app, doc := switchPersistenceApp(t, "originally opened", true)
	baseline := *doc.SourceState
	const changedSource = "changed while recovery was missing"
	if err := os.WriteFile(doc.Path, []byte(changedSource), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(app.store.DraftPath(doc)); err != nil {
		t.Fatal(err)
	}
	got, err := app.GetActiveContent()
	if err != nil || got != changedSource {
		t.Fatalf("saved fallback = %q, %v", got, err)
	}
	if *doc.SourceState != baseline {
		t.Fatal("repair silently adopted the externally changed source baseline")
	}
	result, err := app.SaveActive(got, false)
	if err != nil || result.Conflict == nil {
		t.Fatalf("repair bypassed explicit external-change handling: %#v, %v", result, err)
	}
	source, err := os.ReadFile(doc.Path)
	if err != nil || string(source) != changedSource {
		t.Fatalf("repair changed the saved file: %q, %v", source, err)
	}
}

func TestRecoveryRepairFailureRejectsLoadAndActivationThenRetries(t *testing.T) {
	t.Parallel()
	app, doc := switchPersistenceApp(t, "available saved fallback", true)
	other := session.NewDocument("", "other note")
	app.sess.Add(other)
	previous := app.sess.ActiveID
	if previous == doc.ID {
		t.Fatal("fixture needs a different active document")
	}
	draftPath := app.store.DraftPath(doc)
	draftDir := filepath.Dir(draftPath)
	if err := os.Remove(draftPath); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(draftDir); err != nil {
		t.Fatal(err)
	}
	// A non-directory parent denies repair consistently on Windows and Unix,
	// including test runners with elevated filesystem privileges.
	if err := os.WriteFile(draftDir, []byte("repair blocked"), 0o600); err != nil {
		t.Fatal(err)
	}
	if content, err := app.GetNoteContent(doc.ID); err == nil || content != "" {
		t.Fatalf("failed recovery was acknowledged: %q, %v", content, err)
	}
	if err := app.SetActive(doc.ID); err == nil || !strings.Contains(err.Error(), "recovery") {
		t.Fatalf("activation did not return a descriptive recovery error: %v", err)
	}
	if app.sess.ActiveID != previous {
		t.Fatal("failed repair changed the active document")
	}
	if _, err := app.openPath(doc.Path); err == nil || app.sess.ActiveID != previous {
		t.Fatalf("reopening an existing path bypassed recovery validation: %v", err)
	}
	if err := os.Remove(draftDir); err != nil {
		t.Fatal(err)
	}
	if err := app.SetActive(doc.ID); err != nil {
		t.Fatalf("repair retry failed: %v", err)
	}
	got, err := app.GetActiveContent()
	if err != nil || got != "available saved fallback" || app.sess.ActiveID != doc.ID {
		t.Fatalf("successful retry did not activate recovered source: %q, %v", got, err)
	}
}

func TestRecoveryFallbackIsBoundedAndDoesNotReadReadOnlyAssets(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"missing-source", "oversized-source", "read-only"} {
		t.Run(kind, func(t *testing.T) {
			app, doc := switchPersistenceApp(t, "saved", true)
			draftPath := app.store.DraftPath(doc)
			if err := os.Remove(draftPath); err != nil {
				t.Fatal(err)
			}
			switch kind {
			case "missing-source":
				if err := os.Remove(doc.Path); err != nil {
					t.Fatal(err)
				}
			case "oversized-source":
				if err := os.WriteFile(doc.Path, []byte(strings.Repeat("x", maxEditableFileSize+1)), 0o600); err != nil {
					t.Fatal(err)
				}
			case "read-only":
				doc.Path = filepath.Join(t.TempDir(), "not-read.pdf")
			}
			got, err := app.GetActiveContent()
			if kind == "read-only" {
				if err != nil || got != "" {
					t.Fatalf("read-only content should bypass recovery: %q, %v", got, err)
				}
			} else if err == nil || got != "" {
				t.Fatalf("unavailable saved source was acknowledged: %q, %v", got, err)
			}
			if _, err := os.Stat(draftPath); !os.IsNotExist(err) {
				t.Fatalf("failed or read-only fallback created recovery: %v", err)
			}
		})
	}
}
