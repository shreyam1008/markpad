package main

import (
	"os"
	"path/filepath"
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
