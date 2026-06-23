package main

import (
	"os"
	"path/filepath"
	"sort"
)

const localRecentScanLimit = 2000

type localRecentFile struct {
	file LocalFolderFile
	mod  int64
}

func (a *App) ListRecentLocalFolderFiles(limit int) []LocalFolderFile {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return []LocalFolderFile{}
	}
	if limit <= 0 || limit > 200 {
		limit = 80
	}
	files := make([]localRecentFile, 0, limit)
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
		if scanned >= localRecentScanLimit {
			return filepath.SkipAll
		}
		scanned++
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		rel, err := filepath.Rel(root.Path, path)
		if err != nil {
			rel = filepath.Base(path)
		}
		files = append(files, localRecentFile{
			file: LocalFolderFile{
				Path:     path,
				RelPath:  filepath.ToSlash(rel),
				Title:    filepath.Base(path),
				Kind:     fileKind(path),
				Size:     info.Size(),
				Modified: info.ModTime().Format("2006-01-02 15:04"),
			},
			mod: info.ModTime().Unix(),
		})
		return nil
	})
	sort.SliceStable(files, func(i, j int) bool {
		if files[i].mod == files[j].mod {
			return files[i].file.RelPath < files[j].file.RelPath
		}
		return files[i].mod > files[j].mod
	})
	if len(files) > limit {
		files = files[:limit]
	}
	out := make([]LocalFolderFile, 0, len(files))
	for _, item := range files {
		out = append(out, item.file)
	}
	return out
}
