package main

import (
	"os"
	"runtime"
	"strconv"
	"strings"
)

type RuntimeStats struct {
	GoAlloc      uint64 `json:"goAlloc"`
	GoSys        uint64 `json:"goSys"`
	GoHeapInuse  uint64 `json:"goHeapInuse"`
	GoHeapIdle   uint64 `json:"goHeapIdle"`
	GoNumGC      uint32 `json:"goNumGC"`
	ProcessRSS   uint64 `json:"processRss"`
	RSSAvailable bool   `json:"rssAvailable"`
	RSSSource    string `json:"rssSource"`
}

func (a *App) GetRuntimeStats() RuntimeStats {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	rss, ok, source := readProcessRSS()
	return RuntimeStats{
		GoAlloc:      mem.Alloc,
		GoSys:        mem.Sys,
		GoHeapInuse:  mem.HeapInuse,
		GoHeapIdle:   mem.HeapIdle,
		GoNumGC:      mem.NumGC,
		ProcessRSS:   rss,
		RSSAvailable: ok,
		RSSSource:    source,
	}
}

func readProcessRSS() (uint64, bool, string) {
	if data, err := os.ReadFile("/proc/self/statm"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 2 {
			pages, parseErr := strconv.ParseUint(fields[1], 10, 64)
			if parseErr == nil {
				return pages * uint64(os.Getpagesize()), true, "/proc/self/statm"
			}
		}
	}
	if data, err := os.ReadFile("/proc/self/status"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if !strings.HasPrefix(line, "VmRSS:") {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, parseErr := strconv.ParseUint(fields[1], 10, 64)
				if parseErr == nil {
					return kb * 1024, true, "/proc/self/status"
				}
			}
		}
	}
	return 0, false, "unavailable"
}
