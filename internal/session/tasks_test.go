package session

import "testing"

func TestTaskIdentityFollowsSourceAndSurvivesRestart(t *testing.T) {
	store, err := NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	content := taskMarker + "\r\n<!-- quillpane:categories [\"Work\"] -->\r\n# My tasks\r\n\r\n- [ ] Keep this\r\n"
	doc := NewDocument("", content)
	if !doc.TaskBoard || doc.Title != "My tasks" {
		t.Fatalf("incorrect identity: %+v", doc)
	}
	if err := store.WriteDraft(doc, content); err != nil {
		t.Fatal(err)
	}
	// Older sessions have no cached task field; startup must recover it from source.
	doc.TaskBoard = false
	doc.Title = taskMarker
	sess := &Session{ActiveID: doc.ID, Documents: []*Document{doc}}
	if err := store.Save(sess); err != nil {
		t.Fatal(err)
	}
	loaded, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if !loaded.Active().TaskBoard {
		t.Fatal("legacy task file lost its identity on reopen")
	}
	if loaded.Active().Title != "Tasks" {
		t.Fatal("legacy draft still shows internal metadata as its title")
	}
	if got, err := store.ReadDraft(loaded.Active()); err != nil || got != content {
		t.Fatal("identity detection modified source", err)
	}
	if err := store.WriteDraft(loaded.Active(), "# Ordinary note\n- [ ] Still ordinary\n"); err != nil {
		t.Fatal(err)
	}
	if loaded.Active().TaskBoard {
		t.Fatal("removing the marker kept a stale task identity")
	}
}

func TestTaskIdentityOnlyAppliesToMarkedMarkdown(t *testing.T) {
	for _, path := range []string{"example.txt", "example.json", "example.go"} {
		if NewDocument(path, taskMarker+"\n# Tasks\n").TaskBoard {
			t.Fatalf("%s incorrectly became tasks", path)
		}
	}
	if NewDocument("ordinary.md", "# Note\n- [ ] A checkbox\n").TaskBoard {
		t.Fatal("ordinary checkbox note changed identity")
	}
}
