//go:build !linux

package main

func processRSSBytes() (uint64, bool) {
	return 0, false
}
