package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
