package main

import (
	"os"
	"path/filepath"
	"strings"
)

const (
	localOverviewFileLimit = 1500
	localOverviewReadCap   = 512 * 1024
)

type LocalFolderOverview struct {
	Path           string `json:"path"`
	Missing        bool   `json:"missing"`
	Files          int    `json:"files"`
	Folders        int    `json:"folders"`
	Notes          int    `json:"notes"`
	Canvases       int    `json:"canvases"`
	OtherText      int    `json:"otherText"`
	Tasks          int    `json:"tasks"`
	OpenTasks      int    `json:"openTasks"`
	DoneTasks      int    `json:"doneTasks"`
	TotalBytes     int64  `json:"totalBytes"`
	ScannedFiles   int    `json:"scannedFiles"`
	SkippedFiles   int    `json:"skippedFiles"`
	Truncated      bool   `json:"truncated"`
	LargestRel     string `json:"largestRel"`
	LargestBytes   int64  `json:"largestBytes"`
	NewestRel      string `json:"newestRel"`
	NewestModified string `json:"newestModified"`
}

func (a *App) GetLocalFolderOverview() LocalFolderOverview {
	root := a.GetLocalFolder()
	overview := LocalFolderOverview{Path: root.Path, Missing: root.Missing}
	if root.Path == "" || root.Missing {
		return overview
	}
	var newestUnix int64
	_ = filepath.WalkDir(root.Path, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			overview.SkippedFiles++
			return nil
		}
		if entry.IsDir() {
			if shouldSkipLocalDir(entry.Name()) && path != root.Path {
				return filepath.SkipDir
			}
			if path != root.Path {
				overview.Folders++
			}
			return nil
		}
		if overview.ScannedFiles >= localOverviewFileLimit {
			overview.Truncated = true
			return filepath.SkipAll
		}
		info, err := entry.Info()
		if err != nil {
			overview.SkippedFiles++
			return nil
		}
		overview.Files++
		overview.ScannedFiles++
		overview.TotalBytes += info.Size()
		rel := localOverviewRel(root.Path, path)
		if info.Size() > overview.LargestBytes {
			overview.LargestBytes = info.Size()
			overview.LargestRel = rel
		}
		if mod := info.ModTime().Unix(); mod > newestUnix {
			newestUnix = mod
			overview.NewestRel = rel
			overview.NewestModified = info.ModTime().Format("2006-01-02 15:04")
		}
		localOverviewClassify(path, info.Size(), &overview)
		return nil
	})
	return overview
}

func localOverviewClassify(path string, size int64, overview *LocalFolderOverview) {
	if strings.HasSuffix(strings.ToLower(path), markpadCanvasExtension) {
		overview.Canvases++
		return
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".md", ".markdown", ".mdown":
		overview.Notes++
		localOverviewCountTasks(path, size, overview)
	case ".canvas":
		overview.Canvases++
	case ".txt", ".log", ".json", ".yaml", ".yml", ".toml", ".csv":
		overview.OtherText++
	}
}

func localOverviewCountTasks(path string, size int64, overview *LocalFolderOverview) {
	if size > localOverviewReadCap {
		overview.SkippedFiles++
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		overview.SkippedFiles++
		return
	}
	inFence := false
	fenceMarker := ""
	for _, line := range strings.Split(string(data), "\n") {
		if marker, ok := localFenceMarker(line); ok {
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
		open, done, ok := localTaskLineStatus(line)
		if open && ok {
			overview.Tasks++
			overview.OpenTasks++
		} else if done && ok {
			overview.Tasks++
			overview.DoneTasks++
		}
	}
}

func localOverviewRel(root string, path string) string {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return filepath.Base(path)
	}
	return filepath.ToSlash(rel)
}
