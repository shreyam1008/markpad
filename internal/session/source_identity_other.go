//go:build !aix && !darwin && !dragonfly && !freebsd && !linux && !netbsd && !openbsd && !solaris && !windows

package session

import "os"

func sourceIdentity(_ *os.File, _ os.FileInfo) string {
	return ""
}
