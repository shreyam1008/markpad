package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	localFolderSettingsFile = "local-folder.json"
	localFolderSearchCap    = 1024 * 1024
)

type LocalFolderInfo struct {
	Path    string `json:"path"`
	Missing bool   `json:"missing"`
}

type LocalFolderFile struct {
	Path     string `json:"path"`
	RelPath  string `json:"relPath"`
	Title    string `json:"title"`
	Kind     string `json:"kind"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

type LocalFolderSearchHit struct {
	Path    string `json:"path"`
	RelPath string `json:"relPath"`
	Title   string `json:"title"`
	Kind    string `json:"kind"`
	Line    int    `json:"line"`
	Snippet string `json:"snippet"`
	Score   int    `json:"score"`
}

type localFolderSettings struct {
	DefaultFolder string `json:"defaultFolder"`
}

func (a *App) ChooseLocalFolder() (LocalFolderInfo, error) {
	if a == nil || a.store == nil {
		return LocalFolderInfo{}, errors.New("app is not ready")
	}
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Choose Markpad local folder",
	})
	if err != nil {
		return a.GetLocalFolder(), err
	}
	if strings.TrimSpace(path) == "" {
		return a.GetLocalFolder(), nil
	}
	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
	}
	settings := localFolderSettings{DefaultFolder: path}
	if err := a.writeLocalFolderSettings(settings); err != nil {
		return LocalFolderInfo{}, err
	}
	return a.GetLocalFolder(), nil
}

func (a *App) GetLocalFolder() LocalFolderInfo {
	settings, err := a.readLocalFolderSettings()
	if err != nil || strings.TrimSpace(settings.DefaultFolder) == "" {
		return LocalFolderInfo{}
	}
	_, statErr := os.Stat(settings.DefaultFolder)
	return LocalFolderInfo{Path: settings.DefaultFolder, Missing: statErr != nil}
}

func (a *App) ClearLocalFolder() LocalFolderInfo {
	_ = a.writeLocalFolderSettings(localFolderSettings{})
	return LocalFolderInfo{}
}

func (a *App) ListLocalFolderFiles(limit int) []LocalFolderFile {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return []LocalFolderFile{}
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	files := make([]LocalFolderFile, 0, limit)
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
		if len(files) >= limit {
			return filepath.SkipAll
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		rel, err := filepath.Rel(root.Path, path)
		if err != nil {
			rel = filepath.Base(path)
		}
		kind := fileKind(path)
		files = append(files, LocalFolderFile{
			Path:     path,
			RelPath:  filepath.ToSlash(rel),
			Title:    filepath.Base(path),
			Kind:     kind,
			Size:     info.Size(),
			Modified: info.ModTime().Format("2006-01-02 15:04"),
		})
		return nil
	})
	sort.SliceStable(files, func(i, j int) bool {
		return strings.ToLower(files[i].RelPath) < strings.ToLower(files[j].RelPath)
	})
	return files
}

func (a *App) SearchLocalFolder(query string, limit int) []LocalFolderSearchHit {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return []LocalFolderSearchHit{}
	}
	query = strings.ToLower(strings.TrimSpace(query))
	terms := searchTerms(query)
	if len(terms) == 0 {
		return []LocalFolderSearchHit{}
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	hits := make([]LocalFolderSearchHit, 0, limit)
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
		if len(hits) >= limit {
			return filepath.SkipAll
		}
		kind := fileKind(path)
		if isReadOnlyPath(path) || kind == "archive" {
			return nil
		}
		info, err := entry.Info()
		if err != nil || info.Size() > localFolderSearchCap {
			return nil
		}
		hit, ok := searchLocalFile(root.Path, path, kind, query, terms)
		if ok {
			hits = append(hits, hit)
		}
		return nil
	})
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Score == hits[j].Score {
			return strings.ToLower(hits[i].RelPath) < strings.ToLower(hits[j].RelPath)
		}
		return hits[i].Score > hits[j].Score
	})
	return hits
}

func (a *App) readLocalFolderSettings() (localFolderSettings, error) {
	settings := localFolderSettings{}
	if a == nil || a.store == nil {
		return settings, errors.New("app is not ready")
	}
	data, err := os.ReadFile(filepath.Join(a.store.Root(), localFolderSettingsFile))
	if errors.Is(err, os.ErrNotExist) {
		return settings, nil
	}
	if err != nil {
		return settings, err
	}
	return settings, json.Unmarshal(data, &settings)
}

func (a *App) writeLocalFolderSettings(settings localFolderSettings) error {
	if a == nil || a.store == nil {
		return errors.New("app is not ready")
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return localFolderAtomicWrite(filepath.Join(a.store.Root(), localFolderSettingsFile), data, 0o644)
}

func searchLocalFile(root string, path string, kind string, query string, terms []string) (LocalFolderSearchHit, bool) {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		rel = filepath.Base(path)
	}
	title := filepath.Base(path)
	titleLower := strings.ToLower(title)
	relLower := strings.ToLower(filepath.ToSlash(rel))
	if strings.Contains(titleLower, query) || strings.Contains(relLower, query) {
		return LocalFolderSearchHit{
			Path:    path,
			RelPath: filepath.ToSlash(rel),
			Title:   title,
			Kind:    kind,
			Line:    0,
			Snippet: filepath.ToSlash(rel),
			Score:   120,
		}, true
	}
	file, err := os.Open(path)
	if err != nil {
		return LocalFolderSearchHit{}, false
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 512*1024)
	lineNo := 0
	for scanner.Scan() {
		line := scanner.Text()
		lower := strings.ToLower(line)
		if termsContain(lower, terms) {
			return LocalFolderSearchHit{
				Path:    path,
				RelPath: filepath.ToSlash(rel),
				Title:   title,
				Kind:    kind,
				Line:    lineNo,
				Snippet: strings.TrimSpace(line),
				Score:   maxInt(10, 80-lineNo/50),
			}, true
		}
		lineNo++
	}
	return LocalFolderSearchHit{}, false
}

func termsContain(value string, terms []string) bool {
	for _, term := range terms {
		if !strings.Contains(value, term) {
			return false
		}
	}
	return true
}

func shouldSkipLocalDir(name string) bool {
	switch strings.ToLower(name) {
	case ".git", ".hg", ".svn", "node_modules", ".markpad", ".obsidian", "vendor", "dist", "build", ".cache":
		return true
	default:
		return strings.HasPrefix(name, ".") && name != "."
	}
}

func localFolderAtomicWrite(path string, data []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp." + time.Now().Format("20060102150405.000000000")
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
