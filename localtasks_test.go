package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"markpad/internal/session"
)

func newLocalTaskTestApp(t *testing.T) *App {
	t.Helper()
	store, err := session.NewStoreAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	sess, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	return &App{store: store, sess: sess}
}

func TestLocalTaskAppendPathPrefersExistingCanonicalTaskFile(t *testing.T) {
	root := t.TempDir()
	existing := filepath.Join(root, "tasks.md")
	if err := os.WriteFile(existing, []byte("# Existing\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if got := localTaskAppendPath(root); got != existing {
		t.Fatalf("localTaskAppendPath() = %q, want %q", got, existing)
	}
}

func TestLocalTaskAppendPathReusesLegacyTaskFile(t *testing.T) {
	root := t.TempDir()
	existing := filepath.Join(root, "Tasks.md")
	if err := os.WriteFile(existing, []byte("# Legacy\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if got := localTaskAppendPath(root); got != existing {
		t.Fatalf("localTaskAppendPath() = %q, want %q", got, existing)
	}
}

func TestLocalTaskAppendPathCreatesLowercaseTaskFileByDefault(t *testing.T) {
	root := t.TempDir()
	want := filepath.Join(root, "tasks.md")

	if got := localTaskAppendPath(root); got != want {
		t.Fatalf("localTaskAppendPath() = %q, want %q", got, want)
	}
}

func TestLocalTaskLineStatusMatchesPortableMarkdownTasks(t *testing.T) {
	cases := []struct {
		line string
		open bool
		done bool
		ok   bool
	}{
		{line: "- [ ] bullet", open: true, ok: true},
		{line: "* [x] bullet done", done: true, ok: true},
		{line: "+ [X] bullet done uppercase", done: true, ok: true},
		{line: "1. [ ] ordered", open: true, ok: true},
		{line: "2) [x] ordered done", done: true, ok: true},
		{line: "> - [ ] quoted", open: true, ok: true},
		{line: "plain [ ] text", ok: false},
	}

	for _, tc := range cases {
		open, done, ok := localTaskLineStatus(tc.line)
		if open != tc.open || done != tc.done || ok != tc.ok {
			t.Fatalf("localTaskLineStatus(%q) = open %v done %v ok %v, want open %v done %v ok %v", tc.line, open, done, ok, tc.open, tc.done, tc.ok)
		}
	}
}

func TestCanonicalLocalTaskAppendLineUsesPortableMarkdownCheckbox(t *testing.T) {
	cases := []struct {
		name string
		line string
		want string
	}{
		{name: "plain text", line: "Draft release note", want: "- [ ] Draft release note"},
		{name: "trim plain text", line: "  Draft release note  ", want: "- [ ] Draft release note"},
		{name: "already canonical open", line: "- [ ] Draft release note", want: "- [ ] Draft release note"},
		{name: "done lower", line: "- [x] Publish changelog", want: "- [x] Publish changelog"},
		{name: "done upper", line: "* [X] Publish changelog", want: "- [x] Publish changelog"},
		{name: "ordered", line: "12. [ ] Ordered task", want: "- [ ] Ordered task"},
		{name: "empty", line: " \t ", want: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := canonicalLocalTaskAppendLine(tc.line); got != tc.want {
				t.Fatalf("canonicalLocalTaskAppendLine(%q) = %q, want %q", tc.line, got, tc.want)
			}
		})
	}
}

func TestToggleLocalTaskAtIndexSerializesCanonicalCheckboxState(t *testing.T) {
	markdown := strings.Join([]string{
		"* [X] Done task",
		"+ [ ] Open task",
	}, "\n")

	got := toggleLocalTaskAtIndex(markdown, 0, false)
	want := strings.Join([]string{
		"* [ ] Done task",
		"+ [ ] Open task",
	}, "\n")
	if got != want {
		t.Fatalf("toggleLocalTaskAtIndex(done to open) = %q, want %q", got, want)
	}

	got = toggleLocalTaskAtIndex(markdown, 1, true)
	want = strings.Join([]string{
		"* [X] Done task",
		"+ [x] Open task",
	}, "\n")
	if got != want {
		t.Fatalf("toggleLocalTaskAtIndex(open to done) = %q, want %q", got, want)
	}
}

func TestLocalTaskLineWithStatusRewritesPortableTokens(t *testing.T) {
	now := time.Date(2026, 6, 24, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name   string
		line   string
		status string
		want   string
	}{
		{
			name:   "today removes prior due waiting and opens checkbox",
			line:   "- [x] Ship release due:2026-01-01 @waiting #release !high",
			status: "today",
			want:   "- [ ] Ship release #release !high due:2026-06-24",
		},
		{
			name:   "upcoming uses tomorrow",
			line:   "1. [x] Plan sprint",
			status: "upcoming",
			want:   "1. [ ] Plan sprint due:2026-06-25",
		},
		{
			name:   "waiting preserves quote marker",
			line:   "> - [ ] Blocked due:2026-06-24",
			status: "waiting",
			want:   "> - [ ] Blocked @waiting",
		},
		{
			name:   "done clears scheduling tokens",
			line:   "+ [ ] Publish @waiting due:2026-06-24",
			status: "done",
			want:   "+ [x] Publish",
		},
		{
			name:   "non task unchanged",
			line:   "plain text",
			status: "done",
			want:   "plain text",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := localTaskLineWithStatus(tc.line, tc.status, now); got != tc.want {
				t.Fatalf("localTaskLineWithStatus() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestSetLocalTaskStatusAtIndexSkipsFencedTasks(t *testing.T) {
	now := time.Date(2026, 6, 24, 12, 0, 0, 0, time.UTC)
	markdown := strings.Join([]string{
		"```",
		"- [ ] ignored code task",
		"```",
		"- [ ] outside due:2026-01-01",
	}, "\n")

	got := setLocalTaskStatusAtIndex(markdown, 0, "waiting", now)
	want := strings.Join([]string{
		"```",
		"- [ ] ignored code task",
		"```",
		"- [ ] outside @waiting",
	}, "\n")
	if got != want {
		t.Fatalf("setLocalTaskStatusAtIndex() = %q, want %q", got, want)
	}
}

func TestMoveLocalFolderTaskRewritesMarkdownSource(t *testing.T) {
	app := newLocalTaskTestApp(t)
	root := t.TempDir()
	if err := app.writeLocalFolderSettings(localFolderSettings{DefaultFolder: root}); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "tasks.md")
	content := strings.Join([]string{
		"- [ ] alpha due:2026-01-01 @waiting",
		"- [ ] beta",
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	tasks := app.MoveLocalFolderTask("tasks.md#0", "done")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := strings.Join([]string{
		"- [x] alpha",
		"- [ ] beta",
	}, "\n")
	if string(data) != want {
		t.Fatalf("moved task markdown = %q, want %q", string(data), want)
	}
	if len(tasks) != 2 || !tasks[0].Checked || tasks[0].Due != "" || tasks[0].Waiting {
		t.Fatalf("rescanned task = %#v, want done without due/waiting metadata", tasks)
	}
}

func TestOpenLocalTaskFileCreatesHeadingOnly(t *testing.T) {
	app := newLocalTaskTestApp(t)
	root := t.TempDir()
	if err := app.writeLocalFolderSettings(localFolderSettings{DefaultFolder: root}); err != nil {
		t.Fatal(err)
	}

	if _, err := app.OpenLocalTaskFile(); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "tasks.md")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "# Tasks\n\n" {
		t.Fatalf("tasks.md = %q, want heading only", string(data))
	}
	if strings.Contains(string(data), "Review new Tasks.md workflow") {
		t.Fatalf("tasks.md unexpectedly includes starter task: %q", string(data))
	}
}

func TestOpenLocalTaskFileReusesExistingTaskFileWithoutAppending(t *testing.T) {
	app := newLocalTaskTestApp(t)
	root := t.TempDir()
	if err := app.writeLocalFolderSettings(localFolderSettings{DefaultFolder: root}); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "Tasks.md")
	want := "# Existing\n\n- [ ] keep this\n"
	if err := os.WriteFile(path, []byte(want), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := app.OpenLocalTaskFile(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != want {
		t.Fatalf("Tasks.md changed = %q, want %q", string(data), want)
	}
	if strings.Contains(string(data), "Review new Tasks.md workflow") {
		t.Fatalf("Tasks.md unexpectedly includes starter task: %q", string(data))
	}
}

func TestLocalTaskPathFromIDRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	if _, _, ok := localTaskPathFromID(root, "../outside.md#0"); ok {
		t.Fatal("localTaskPathFromID accepted traversal task id")
	}
}

func TestScanLocalFolderTasksReportsLimitsAndPortableCounts(t *testing.T) {
	root := t.TempDir()
	content := strings.Join([]string{
		"- [ ] open task",
		"- [x] done task",
		"```",
		"- [ ] ignored code task",
		"```",
		"1. [ ] ordered task",
	}, "\n")
	if err := os.WriteFile(filepath.Join(root, "tasks.md"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	profile, tasks := scanLocalFolderTasks(LocalFolderInfo{Path: root}, 2, true)
	if len(tasks) != 2 {
		t.Fatalf("len(tasks) = %d, want 2", len(tasks))
	}
	if profile.Tasks != 2 || profile.OpenTasks != 1 || profile.DoneTasks != 1 {
		t.Fatalf("profile counts = tasks %d open %d done %d, want tasks 2 open 1 done 1", profile.Tasks, profile.OpenTasks, profile.DoneTasks)
	}
	if !profile.Truncated {
		t.Fatalf("profile.Truncated = false, want true")
	}
	if profile.MarkdownFiles != 1 || profile.TaskFiles != 1 {
		t.Fatalf("profile files = markdown %d task %d, want 1/1", profile.MarkdownFiles, profile.TaskFiles)
	}
}
