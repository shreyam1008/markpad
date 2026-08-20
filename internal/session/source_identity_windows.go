//go:build windows

package session

import (
	"fmt"
	"os"
	"syscall"
)

func sourceIdentity(file *os.File, _ os.FileInfo) string {
	if file == nil {
		return ""
	}
	var info syscall.ByHandleFileInformation
	if err := syscall.GetFileInformationByHandle(syscall.Handle(file.Fd()), &info); err != nil {
		return ""
	}
	return fmt.Sprintf(
		"%x:%x:%x",
		info.VolumeSerialNumber,
		info.FileIndexHigh,
		info.FileIndexLow,
	)
}
