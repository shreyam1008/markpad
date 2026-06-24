package main

import (
	"runtime"
	"testing"
)

func TestRuntimeStatsIncludesProcessMemory(t *testing.T) {
	stats := (&App{}).GetRuntimeStats()

	if stats.OS != runtime.GOOS {
		t.Fatalf("OS = %q, want %q", stats.OS, runtime.GOOS)
	}
	if stats.Arch != runtime.GOARCH {
		t.Fatalf("Arch = %q, want %q", stats.Arch, runtime.GOARCH)
	}
	if stats.Goroutines < 1 {
		t.Fatalf("Goroutines = %d, want at least 1", stats.Goroutines)
	}
	if stats.ProcessRSSAvailable && stats.ProcessRSSBytes == 0 {
		t.Fatal("ProcessRSSAvailable is true but ProcessRSSBytes is 0")
	}
	if runtime.GOOS != "linux" {
		return
	}

	if !stats.ProcessTreeRSSReady {
		t.Fatal("linux process tree RSS should be available")
	}
	if stats.ProcessTreeRSSBytes == 0 {
		t.Fatal("linux process tree RSS should be greater than 0")
	}
	if stats.ProcessTreeCount < 1 {
		t.Fatalf("ProcessTreeCount = %d, want at least 1", stats.ProcessTreeCount)
	}
	if stats.ProcessTreePSSReady && stats.ProcessTreePSSBytes == 0 {
		t.Fatal("ProcessTreePSSReady is true but ProcessTreePSSBytes is 0")
	}
	if stats.ProcessTreeSource == "" {
		t.Fatal("ProcessTreeSource should describe the sampler")
	}
}
