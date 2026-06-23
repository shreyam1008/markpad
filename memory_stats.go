package main

import (
	"os"
	"runtime"
	"time"
)

var runtimeStatsStartedAt = time.Now()

type RuntimeStats struct {
	GoAllocBytes        uint64 `json:"goAllocBytes"`
	GoSysBytes          uint64 `json:"goSysBytes"`
	GoHeapInuseBytes    uint64 `json:"goHeapInuseBytes"`
	GoHeapIdleBytes     uint64 `json:"goHeapIdleBytes"`
	GoHeapReleasedBytes uint64 `json:"goHeapReleasedBytes"`
	GoObjects           uint64 `json:"goObjects"`
	Goroutines          int    `json:"goroutines"`
	ProcessRSSBytes     uint64 `json:"processRssBytes"`
	ProcessRSSAvailable bool   `json:"processRssAvailable"`
	ExecutableSizeBytes uint64 `json:"executableSizeBytes"`
	UptimeSeconds       int64  `json:"uptimeSeconds"`
	OS                  string `json:"os"`
	Arch                string `json:"arch"`
}

func (a *App) GetRuntimeStats() RuntimeStats {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	rss, rssAvailable := processRSSBytes()
	executableSize := executableSizeBytes()

	return RuntimeStats{
		GoAllocBytes:        mem.Alloc,
		GoSysBytes:          mem.Sys,
		GoHeapInuseBytes:    mem.HeapInuse,
		GoHeapIdleBytes:     mem.HeapIdle,
		GoHeapReleasedBytes: mem.HeapReleased,
		GoObjects:           mem.HeapObjects,
		Goroutines:          runtime.NumGoroutine(),
		ProcessRSSBytes:     rss,
		ProcessRSSAvailable: rssAvailable,
		ExecutableSizeBytes: executableSize,
		UptimeSeconds:       int64(time.Since(runtimeStatsStartedAt).Seconds()),
		OS:                  runtime.GOOS,
		Arch:                runtime.GOARCH,
	}
}

func executableSizeBytes() uint64 {
	path, err := os.Executable()
	if err != nil {
		return 0
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return 0
	}
	return uint64(info.Size())
}
