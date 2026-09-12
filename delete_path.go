package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func validateDeleteTarget(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("file path is required")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve file path: %w", err)
	}
	abs = filepath.Clean(abs)
	if err := ensureAbsolutePathHasNoSymlinks(abs); err != nil {
		return "", err
	}
	info, err := os.Lstat(abs)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("only regular files can be deleted")
	}
	return abs, nil
}

func ensureAbsolutePathHasNoSymlinks(path string) error {
	current := filepath.Clean(path)
	components := make([]string, 0, 8)
	for {
		components = append(components, current)
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	for index := len(components) - 1; index >= 0; index-- {
		info, err := os.Lstat(components[index])
		if err != nil {
			return fmt.Errorf("inspect file path: %w", err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink files cannot be deleted")
		}
	}
	return nil
}
