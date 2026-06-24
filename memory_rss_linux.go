//go:build linux

package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

func processRSSBytes() (uint64, bool) {
	info, ok := readLinuxProcStatus(os.Getpid())
	if !ok || !info.rssAvailable {
		return 0, false
	}
	return info.rssBytes, true
}

type linuxProcStatus struct {
	pid          int
	ppid         int
	rssBytes     uint64
	rssAvailable bool
}

func readLinuxProcStatus(pid int) (linuxProcStatus, bool) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return linuxProcStatus{}, false
	}

	info := linuxProcStatus{pid: pid}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "PPid:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				if ppid, err := strconv.Atoi(fields[1]); err == nil {
					info.ppid = ppid
				}
			}
		}
		if strings.HasPrefix(line, "VmRSS:") {
			if bytes, ok := parseLinuxStatusKiB(line); ok {
				info.rssBytes = bytes
				info.rssAvailable = true
			}
		}
	}
	return info, true
}

func parseLinuxStatusKiB(line string) (uint64, bool) {
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

func readLinuxPSSBytes(pid int) (uint64, bool) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/smaps_rollup", pid))
	if err != nil {
		return 0, false
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "Pss:") {
			return parseLinuxStatusKiB(line)
		}
	}
	return 0, false
}

func processTreeMemory() processTreeMemoryStats {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return processTreeMemoryStats{Source: "linux /proc unavailable"}
	}

	procs := make(map[int]linuxProcStatus, 128)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}
		if info, ok := readLinuxProcStatus(pid); ok {
			procs[pid] = info
		}
	}

	self := os.Getpid()
	descendants := map[int]bool{self: true}
	for changed := true; changed; {
		changed = false
		for pid, info := range procs {
			if descendants[pid] || !descendants[info.ppid] {
				continue
			}
			descendants[pid] = true
			changed = true
		}
	}

	stats := processTreeMemoryStats{
		ProcessCount: len(descendants),
		Source:       "linux /proc status + smaps_rollup",
	}
	for pid := range descendants {
		info, ok := procs[pid]
		if ok && info.rssAvailable {
			stats.RSSBytes += info.rssBytes
			stats.RSSAvailable = true
		}
		if pss, ok := readLinuxPSSBytes(pid); ok {
			stats.PSSBytes += pss
			stats.PSSAvailable = true
		}
	}

	return stats
}
