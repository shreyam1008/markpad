//go:build linux

package main

import (
	"os"
	"strconv"
	"strings"
)

func processRSSBytes() (uint64, bool) {
	data, err := os.ReadFile("/proc/self/status")
	if err != nil {
		return 0, false
	}

	for _, line := range strings.Split(string(data), "\n") {
		if !strings.HasPrefix(line, "VmRSS:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return 0, false
		}
		kb, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			return 0, false
		}
		return kb * 1024, true
	}

	return 0, false
}
