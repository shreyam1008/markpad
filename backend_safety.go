package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"markpad/internal/brand"
)

const (
	maxEditableFileSize = 2 << 20
	maxReadOnlyFileSize = 50 << 20
)

func canonicalPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}

	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
	}
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		path = resolved
	}
	return filepath.Clean(path)
}

func readOpenFile(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	limit := int64(maxEditableFileSize)
	if isReadOnlyAsset(path) {
		limit = maxReadOnlyFileSize
	}

	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if info.Size() > limit {
		return nil, fmt.Errorf("file is too large to open in %s (%d MiB limit)", brand.ProductName, limit>>20)
	}

	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("file is too large to open in %s (%d MiB limit)", brand.ProductName, limit>>20)
	}
	return data, nil
}

func isReadOnlyAsset(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico":
		return true
	default:
		return false
	}
}

func (a *App) recordBackgroundError(operation string, err error) {
	if err != nil {
		log.Printf("%s: %s: %v", brand.BinaryName, operation, err)
	}
}
