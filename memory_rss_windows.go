//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

var (
	kernel32Process      = syscall.NewLazyDLL("kernel32.dll")
	psapiProcess         = syscall.NewLazyDLL("psapi.dll")
	getCurrentProcess    = kernel32Process.NewProc("GetCurrentProcess")
	getProcessMemoryInfo = psapiProcess.NewProc("GetProcessMemoryInfo")
)

type processMemoryCounters struct {
	CB                         uint32
	PageFaultCount             uint32
	PeakWorkingSetSize         uintptr
	WorkingSetSize             uintptr
	QuotaPeakPagedPoolUsage    uintptr
	QuotaPagedPoolUsage        uintptr
	QuotaPeakNonPagedPoolUsage uintptr
	QuotaNonPagedPoolUsage     uintptr
	PagefileUsage              uintptr
	PeakPagefileUsage          uintptr
}

func processRSSBytes() (uint64, bool) {
	handle, _, _ := getCurrentProcess.Call()
	if handle == 0 {
		return 0, false
	}

	var counters processMemoryCounters
	counters.CB = uint32(unsafe.Sizeof(counters))
	ok, _, _ := getProcessMemoryInfo.Call(
		handle,
		uintptr(unsafe.Pointer(&counters)),
		uintptr(counters.CB),
	)
	if ok == 0 {
		return 0, false
	}

	return uint64(counters.WorkingSetSize), true
}

func processTreeMemory() processTreeMemoryStats {
	return processTreeMemoryStats{Source: "process tree memory unavailable on windows"}
}
