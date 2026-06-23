//go:build !linux && !windows

package main

func processRSSBytes() (uint64, bool) {
	return 0, false
}
