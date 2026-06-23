package main

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const (
	localLinksFileLimit = 1500
	localLinksReadCap   = 512 * 1024
)

var (
	localWikiLinkRe     = regexp.MustCompile(`\[\[([^\]\|\#]+)(?:[\|\#][^\]]*)?\]\]`)
	localMarkdownLinkRe = regexp.MustCompile(`\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)`)
)

type LocalFolderLink struct {
	Target    string `json:"target"`
	Kind      string `json:"kind"`
	Count     int    `json:"count"`
	Files     int    `json:"files"`
	LatestRel string `json:"latestRel"`
}

type localLinkHit struct {
	target string
	kind   string
}

type localLinkAccumulator struct {
	target     string
	kind       string
	count      int
	files      int
	latestRel  string
	latestUnix int64
}

func (a *App) ListLocalFolderLinks(limit int) []LocalFolderLink {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return []LocalFolderLink{}
	}
	if limit <= 0 || limit > 300 {
		limit = 120
	}
	scanned := 0
	links := make(map[string]*localLinkAccumulator)
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
		if scanned >= localLinksFileLimit {
			return filepath.SkipAll
		}
		if !localLinksMarkdown(path) {
			return nil
		}
		info, err := entry.Info()
		if err != nil || info.Size() > localLinksReadCap {
			return nil
		}
		scanned++
		localLinksScanFile(path, info.ModTime().Unix(), localLinksRel(root.Path, path), links)
		return nil
	})
	out := make([]LocalFolderLink, 0, len(links))
	for _, acc := range links {
		out = append(out, LocalFolderLink{
			Target:    acc.target,
			Kind:      acc.kind,
			Count:     acc.count,
			Files:     acc.files,
			LatestRel: acc.latestRel,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Count == out[j].Count {
			if out[i].Files == out[j].Files {
				if out[i].Kind == out[j].Kind {
					return strings.ToLower(out[i].Target) < strings.ToLower(out[j].Target)
				}
				return out[i].Kind < out[j].Kind
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

func localLinksScanFile(path string, modified int64, rel string, links map[string]*localLinkAccumulator) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
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
		for _, hit := range localLinksFromLine(line) {
			key := hit.kind + "\x00" + strings.ToLower(hit.target)
			acc := links[key]
			if acc == nil {
				acc = &localLinkAccumulator{target: hit.target, kind: hit.kind}
				links[key] = acc
			}
			acc.count++
			if !seenInFile[key] {
				seenInFile[key] = true
				acc.files++
			}
			if modified >= acc.latestUnix {
				acc.latestUnix = modified
				acc.latestRel = rel
			}
		}
	}
}

func localLinksFromLine(line string) []localLinkHit {
	out := []localLinkHit{}
	for _, match := range localWikiLinkRe.FindAllStringSubmatch(line, -1) {
		target := localLinksNormalizeTarget(match[1])
		if target != "" {
			out = append(out, localLinkHit{target: target, kind: "wiki"})
		}
	}
	for _, match := range localMarkdownLinkRe.FindAllStringSubmatch(line, -1) {
		target := localLinksNormalizeTarget(match[1])
		if target != "" && localLinksLocalTarget(target) {
			out = append(out, localLinkHit{target: target, kind: "markdown"})
		}
	}
	return out
}

func localLinksNormalizeTarget(target string) string {
	target = strings.TrimSpace(target)
	target = strings.Trim(target, "<>")
	if i := strings.Index(target, "#"); i >= 0 {
		target = target[:i]
	}
	target = strings.TrimPrefix(target, "./")
	target = strings.TrimSpace(target)
	return target
}

func localLinksLocalTarget(target string) bool {
	lower := strings.ToLower(target)
	if target == "" || strings.HasPrefix(target, "#") {
		return false
	}
	if strings.Contains(lower, "://") {
		return false
	}
	if strings.HasPrefix(lower, "mailto:") || strings.HasPrefix(lower, "tel:") || strings.HasPrefix(lower, "data:") {
		return false
	}
	return true
}

func localLinksMarkdown(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown", ".mdown":
		return true
	default:
		return false
	}
}

func localLinksRel(root string, path string) string {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return filepath.Base(path)
	}
	return filepath.ToSlash(rel)
}
