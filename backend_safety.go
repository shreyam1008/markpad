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
	maxEditableFileSize  = 2 << 20
	maxReadOnlyFileSize  = 50 << 20
	maxMarkdownImageSize = 8 << 20
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
	limit := int64(maxEditableFileSize)
	if isReadOnlyAsset(path) {
		limit = maxReadOnlyFileSize
	}
	return readFileWithinLimit(path, limit)
}

func readFileWithinLimit(path string, limit int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

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

func resolveMarkdownAssetPath(markdownPath, source string) (string, error) {
	if strings.TrimSpace(markdownPath) == "" {
		return "", fmt.Errorf("markdown document has no local path")
	}
	reference := strings.TrimSpace(source)
	if reference == "" || strings.HasPrefix(reference, "#") || strings.HasPrefix(reference, "/") || strings.HasPrefix(reference, `\`) || hasURIScheme(reference) {
		return "", fmt.Errorf("markdown image is not a relative local path")
	}
	if separator := strings.IndexAny(reference, "?#"); separator >= 0 {
		reference = reference[:separator]
	}
	assetPath, err := decodeURLPath(reference)
	if err != nil {
		return "", err
	}
	assetPath = filepath.FromSlash(assetPath)
	if assetPath == "" || strings.HasPrefix(assetPath, "/") || strings.HasPrefix(assetPath, `\`) || filepath.IsAbs(assetPath) || filepath.VolumeName(assetPath) != "" {
		return "", fmt.Errorf("markdown image is not a relative local path")
	}
	resolved := canonicalPath(filepath.Join(filepath.Dir(canonicalPath(markdownPath)), assetPath))
	if !isReadOnlyAsset(resolved) || strings.EqualFold(filepath.Ext(resolved), ".pdf") {
		return "", fmt.Errorf("markdown asset is not a supported image")
	}
	return resolved, nil
}

func hasURIScheme(value string) bool {
	separator := strings.IndexByte(value, ':')
	if separator <= 0 {
		return false
	}
	for index := 0; index < separator; index++ {
		char := value[index]
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (index > 0 && ((char >= '0' && char <= '9') || char == '+' || char == '-' || char == '.')) {
			continue
		}
		return false
	}
	return true
}

func decodeURLPath(value string) (string, error) {
	decoded := make([]byte, 0, len(value))
	for index := 0; index < len(value); index++ {
		if value[index] != '%' {
			decoded = append(decoded, value[index])
			continue
		}
		if index+2 >= len(value) {
			return "", fmt.Errorf("decode markdown image path: incomplete escape")
		}
		high, highOK := hexNibble(value[index+1])
		low, lowOK := hexNibble(value[index+2])
		if !highOK || !lowOK {
			return "", fmt.Errorf("decode markdown image path: invalid escape")
		}
		decoded = append(decoded, high<<4|low)
		index += 2
	}
	if strings.IndexByte(string(decoded), 0) >= 0 {
		return "", fmt.Errorf("decode markdown image path: invalid null byte")
	}
	return string(decoded), nil
}

func hexNibble(char byte) (byte, bool) {
	switch {
	case char >= '0' && char <= '9':
		return char - '0', true
	case char >= 'a' && char <= 'f':
		return char - 'a' + 10, true
	case char >= 'A' && char <= 'F':
		return char - 'A' + 10, true
	default:
		return 0, false
	}
}

func markdownImageMIMEType(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".bmp":
		return "image/bmp"
	case ".ico":
		return "image/x-icon"
	default:
		return "application/octet-stream"
	}
}

func (a *App) recordBackgroundError(operation string, err error) {
	if err != nil {
		log.Printf("%s: %s: %v", brand.BinaryName, operation, err)
	}
}
