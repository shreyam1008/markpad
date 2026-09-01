package main

import (
	"encoding/json"
	"testing"

	"markpad/internal/session"
)

func TestEmptySessionUsesFrontendSafeArrays(t *testing.T) {
	app := NewApp()
	app.sess = &session.Session{}

	encoded, err := json.Marshal(app.GetSession())
	if err != nil {
		t.Fatalf("marshal empty frontend session: %v", err)
	}

	var payload map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatalf("decode empty frontend session: %v", err)
	}
	for _, field := range []string{"notes", "favorites", "recents"} {
		if string(payload[field]) != "[]" {
			t.Fatalf("%s must serialize as an array, got %s", field, payload[field])
		}
	}
}

func TestUnavailableSessionUsesFrontendSafeArrays(t *testing.T) {
	encoded, err := json.Marshal(NewApp().GetSession())
	if err != nil {
		t.Fatalf("marshal unavailable frontend session: %v", err)
	}
	if string(encoded) != `{"activeId":"","notes":[],"favorites":[],"recents":[]}` {
		t.Fatalf("unexpected unavailable session payload: %s", encoded)
	}
}

func TestUnsavedDocumentCountIgnoresEmptyDrafts(t *testing.T) {
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatalf("create session store: %v", err)
	}

	empty := session.NewDocument("", "")
	empty.Dirty = true
	file := session.NewDocument("saved.md", "saved")
	file.Dirty = true
	draft := session.NewDocument("", "changed")
	if err := store.WriteDraft(draft, "changed"); err != nil {
		t.Fatalf("write draft: %v", err)
	}

	app := NewApp()
	app.store = store
	app.sess = &session.Session{Documents: []*session.Document{empty, file, draft}}

	if got := app.unsavedDocumentCount(); got != 2 {
		t.Fatalf("unsaved document count = %d, want 2", got)
	}
}
