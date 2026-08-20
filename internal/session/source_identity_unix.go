//go:build aix || darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package session

import (
	"fmt"
	"os"
	"syscall"
)

func sourceIdentity(_ *os.File, info os.FileInfo) string {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat == nil {
		return ""
	}
	return fmt.Sprintf("%x:%x", uint64(stat.Dev), uint64(stat.Ino))
}
