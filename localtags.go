package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	localTagsFileLimit = 1500
	localTagsReadCap   = 512 * 1024
)

type LocalFolderTag struct {
	Tag       string `json:"tag"`
	Count     int    `json:"count"`
	Files     int    `json:"files"`
	LatestRel string `json:"latestRel"`
}

type localTagAccumulator struct {
	count      int
	files      int
	latestRel  string
	latestUnix int64
}

func (a *App) ListLocalFolderTags(limit int) []LocalFolderTag {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return []LocalFolderTag{}
	}
	if limit <= 0 || limit > 200 {
		limit = 80
	}
	scanned := 0
	tags := make(map[string]*localTagAccumulator)
	_ = filepath.WalkDir(root.Path, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			if shouldSkipLocalDir(entry.Name()) && path != root.Path {
				return filepath.SkipDir
			}
			return nil
		}
		if scanned >= localTagsFileLimit {
			return filepath.SkipAll
		}
		if !localTagsMarkdown(path) {
			return nil
		}
		info, err := entry.Info()
		if err != nil || info.Size() > localTagsReadCap {
			return nil
		}
		scanned++
		localTagsScanFile(root.Path, path, info.ModTime().Unix(), tags)
		return nil
	})
	out := make([]LocalFolderTag, 0, len(tags))
	for tag, acc := range tags {
		out = append(out, LocalFolderTag{Tag: tag, Count: acc.count, Files: acc.files, LatestRel: acc.latestRel})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Count == out[j].Count {
			if out[i].Files == out[j].Files {
				return out[i].Tag < out[j].Tag
			}
			return out[i].Files > out[j].Files
		}
		return out[i].Count > out[j].Count
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func localTagsMarkdown(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown", ".mdown":
		return true
	default:
		return false
	}
}

func localTagsScanFile(root string, path string, modified int64, tags map[string]*localTagAccumulator) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	rel := localTagsRel(root, path)
	seenInFile := make(map[string]bool)
	inFence := false
	fenceMarker := ""
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			marker := trimmed[:3]
			if !inFence {
				inFence = true
				fenceMarker = marker
			} else if marker == fenceMarker {
				inFence = false
				fenceMarker = ""
			}
			continue
		}
		if inFence {
			continue
		}
		for _, tag := range localTagsFromLine(line) {
			acc := tags[tag]
			if acc == nil {
				acc = &localTagAccumulator{}
				tags[tag] = acc
			}
			acc.count++
			if !seenInFile[tag] {
				seenInFile[tag] = true
				acc.files++
			}
			if modified >= acc.latestUnix {
				acc.latestUnix = modified
				acc.latestRel = rel
			}
		}
	}
}

func localTagsFromLine(line string) []string {
	out := []string{}
	for i := 0; i < len(line); i++ {
		if line[i] != '#' {
			continue
		}
		if i > 0 && !localTagsBoundary(line[i-1]) {
			continue
		}
		j := i + 1
		for j < len(line) && localTagsChar(line[j]) {
			j++
		}
		if j == i+1 {
			continue
		}
		tag := strings.ToLower(line[i+1 : j])
		if localTagsLooksLikeHex(tag) {
			continue
		}
		out = append(out, tag)
	}
	return out
}

func localTagsBoundary(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '(' || b == '[' || b == '{' || b == '"' || b == '\''
}

func localTagsChar(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '_' || b == '-' || b == '/'
}

func localTagsLooksLikeHex(tag string) bool {
	if len(tag) != 3 && len(tag) != 6 && len(tag) != 8 {
		return false
	}
	for i := 0; i < len(tag); i++ {
		b := tag[i]
		if !((b >= '0' && b <= '9') || (b >= 'a' && b <= 'f')) {
			return false
		}
	}
	return true
}

func localTagsRel(root string, path string) string {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return filepath.Base(path)
	}
	return filepath.ToSlash(rel)
}
