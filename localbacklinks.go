package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	localBacklinksFileLimit = 1500
	localBacklinksReadCap   = 512 * 1024
)

type LocalFolderBacklink struct {
	Path    string `json:"path"`
	RelPath string `json:"relPath"`
	Title   string `json:"title"`
	Line    int    `json:"line"`
	Snippet string `json:"snippet"`
}

func (a *App) ListLocalFolderBacklinks(targetPath string, targetTitle string, limit int) []LocalFolderBacklink {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing || strings.TrimSpace(targetPath) == "" {
		return []LocalFolderBacklink{}
	}
	if limit <= 0 || limit > 200 {
		limit = 80
	}
	targetAbs, err := filepath.Abs(targetPath)
	if err != nil {
		targetAbs = targetPath
	}
	candidates := localBacklinkCandidates(root.Path, targetAbs, targetTitle)
	if len(candidates) == 0 {
		return []LocalFolderBacklink{}
	}
	hits := make([]LocalFolderBacklink, 0, limit)
	scanned := 0
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
		if scanned >= localBacklinksFileLimit || len(hits) >= limit {
			return filepath.SkipAll
		}
		if !localBacklinksMarkdown(path) {
			return nil
		}
		abs, err := filepath.Abs(path)
		if err == nil && abs == targetAbs {
			return nil
		}
		info, err := entry.Info()
		if err != nil || info.Size() > localBacklinksReadCap {
			return nil
		}
		scanned++
		hits = append(hits, localBacklinkScanFile(root.Path, path, candidates, limit-len(hits))...)
		return nil
	})
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].RelPath == hits[j].RelPath {
			return hits[i].Line < hits[j].Line
		}
		return strings.ToLower(hits[i].RelPath) < strings.ToLower(hits[j].RelPath)
	})
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits
}

func localBacklinkCandidates(root string, targetPath string, targetTitle string) map[string]bool {
	out := make(map[string]bool)
	add := func(value string) {
		value = localBacklinkNormalize(value)
		if value != "" {
			out[value] = true
		}
	}
	add(targetTitle)
	base := filepath.Base(targetPath)
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	add(base)
	add(stem)
	if rel, err := filepath.Rel(root, targetPath); err == nil {
		rel = filepath.ToSlash(rel)
		add(rel)
		add(strings.TrimSuffix(rel, filepath.Ext(rel)))
		add(filepath.Base(rel))
		add(strings.TrimSuffix(filepath.Base(rel), filepath.Ext(rel)))
	}
	return out
}

func localBacklinkScanFile(root string, path string, candidates map[string]bool, remaining int) []LocalFolderBacklink {
	if remaining <= 0 {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	rel := localBacklinkRel(root, path)
	hits := make([]LocalFolderBacklink, 0, 2)
	inFence := false
	fenceMarker := ""
	lines := strings.Split(string(data), "\n")
	for lineNumber, line := range lines {
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
		if localBacklinkLineMatches(line, candidates) {
			hits = append(hits, LocalFolderBacklink{
				Path:    path,
				RelPath: rel,
				Title:   filepath.Base(path),
				Line:    lineNumber,
				Snippet: localBacklinkSnippet(line),
			})
			if len(hits) >= remaining {
				break
			}
		}
	}
	return hits
}

func localBacklinkLineMatches(line string, candidates map[string]bool) bool {
	for _, match := range localWikiLinkRe.FindAllStringSubmatch(line, -1) {
		if candidates[localBacklinkNormalize(match[1])] {
			return true
		}
	}
	for _, match := range localMarkdownLinkRe.FindAllStringSubmatch(line, -1) {
		target := localLinksNormalizeTarget(match[1])
		if !localLinksLocalTarget(target) {
			continue
		}
		if candidates[localBacklinkNormalize(target)] {
			return true
		}
	}
	return false
}

func localBacklinkNormalize(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Trim(value, "<>")
	value = strings.TrimPrefix(value, "./")
	if i := strings.Index(value, "#"); i >= 0 {
		value = value[:i]
	}
	value = filepath.ToSlash(value)
	value = strings.TrimSpace(value)
	return strings.ToLower(value)
}

func localBacklinkSnippet(line string) string {
	snippet := strings.Join(strings.Fields(line), " ")
	if len(snippet) > 180 {
		return snippet[:180] + "..."
	}
	return snippet
}

func localBacklinksMarkdown(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown", ".mdown":
		return true
	default:
		return false
	}
}

func localBacklinkRel(root string, path string) string {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return filepath.Base(path)
	}
	return filepath.ToSlash(rel)
}
