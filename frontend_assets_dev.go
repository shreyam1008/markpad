//go:build !production

package main

import (
	"io/fs"
	"os"
)

// frontendAssets leaves asset delivery to the Wails development server in
// non-production builds. Keeping this fallback independent of generated files
// also lets backend tests run from a clean checkout.
func frontendAssets() fs.FS {
	return os.DirFS("frontend/dist")
}
