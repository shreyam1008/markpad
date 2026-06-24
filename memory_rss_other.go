//go:build !linux && !windows

package main

func processRSSBytes() (uint64, bool) {
	return 0, false
}

func processTreeMemory() processTreeMemoryStats {
	return processTreeMemoryStats{Source: "process tree memory unavailable on this OS"}
}
