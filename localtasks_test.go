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
