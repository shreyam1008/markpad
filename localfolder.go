package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	localFolderSettingsFile = "local-folder.json"
	localFolderSearchCap    = 1024 * 1024
	localFolderSearchPool   = 300
)

var (
	localFolderSearches            localFolderSearchGate
	localFolderSearchTestYieldHook func()
)

type localFolderSearchGate struct {
	mu      sync.Mutex
	current uint64
	scan    sync.Mutex
}

func (g *localFolderSearchGate) begin() uint64 {
	g.mu.Lock()
	g.current++
	id := g.current
	g.mu.Unlock()

	g.scan.Lock()
	return id
}

func (g *localFolderSearchGate) end() {
	g.scan.Unlock()
}

func (g *localFolderSearchGate) isLatest(id uint64) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.current == id
}

func (g *localFolderSearchGate) currentID() uint64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.current
}

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
	Path      string `json:"path"`
	RelPath   string `json:"relPath"`
	Title     string `json:"title"`
	Kind      string `json:"kind"`
	Line      int    `json:"line"`
	Snippet   string `json:"snippet"`
	Score     int    `json:"score"`
	MatchKind string `json:"matchKind"`
}

type LocalFolderSearchResult struct {
	Hits       []LocalFolderSearchHit `json:"hits"`
	Scanned    int                    `json:"scanned"`
	Searchable int                    `json:"searchable"`
	Skipped    int                    `json:"skipped"`
	Oversize   int                    `json:"oversize"`
	Candidates int                    `json:"candidates"`
	Limit      int                    `json:"limit"`
	Capped     bool                   `json:"capped"`
	ElapsedMs  int64                  `json:"elapsedMs"`
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
	return a.SearchLocalFolderWithStats(query, limit).Hits
}

func (a *App) SearchLocalFolderWithStats(query string, limit int) (result LocalFolderSearchResult) {
	started := time.Now()
	result = LocalFolderSearchResult{Hits: []LocalFolderSearchHit{}}
	defer func() {
		result.ElapsedMs = time.Since(started).Milliseconds()
	}()
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return
	}
	plan := parseLocalFolderSearchQuery(query)
	if len(plan.Terms) == 0 && len(plan.Phrases) == 0 && !plan.HasFilters {
		return
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	result.Limit = limit
	candidateLimit := maxInt(limit*4, limit)
	if candidateLimit > localFolderSearchPool {
		candidateLimit = localFolderSearchPool
	}
	searchID := localFolderSearches.begin()
	defer localFolderSearches.end()
	if !localFolderSearches.isLatest(searchID) {
		return
	}
	hits := make([]LocalFolderSearchHit, 0, candidateLimit)
	_ = filepath.WalkDir(root.Path, func(path string, entry os.DirEntry, err error) error {
		if !localFolderSearches.isLatest(searchID) {
			return filepath.SkipAll
		}
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			if shouldSkipLocalDir(entry.Name()) && path != root.Path {
				result.Skipped++
				return filepath.SkipDir
			}
			return nil
		}
		result.Scanned++
		kind := fileKind(path)
		if isReadOnlyPath(path) || kind == "archive" {
			result.Skipped++
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			result.Skipped++
			return nil
		}
		if info.Size() > localFolderSearchCap {
			result.Skipped++
			result.Oversize++
			return nil
		}
		result.Searchable++
		if localFolderSearchTestYieldHook != nil {
			localFolderSearchTestYieldHook()
		}
		if !localFolderSearches.isLatest(searchID) {
			return filepath.SkipAll
		}
		hit, ok := searchLocalFile(root.Path, path, kind, plan)
		if ok {
			result.Candidates++
			hits = append(hits, hit)
			if len(hits) > candidateLimit {
				sortLocalFolderSearchHits(hits)
				hits = hits[:candidateLimit]
				result.Capped = true
			}
		}
		return nil
	})
	if !localFolderSearches.isLatest(searchID) {
		return
	}
	sortLocalFolderSearchHits(hits)
	if len(hits) > limit {
		hits = hits[:limit]
		result.Capped = true
	}
	if result.Candidates > len(hits) {
		result.Capped = true
	}
	result.Hits = hits
	return
}

func sortLocalFolderSearchHits(hits []LocalFolderSearchHit) {
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Score == hits[j].Score {
			return strings.ToLower(hits[i].RelPath) < strings.ToLower(hits[j].RelPath)
		}
		return hits[i].Score > hits[j].Score
	})
}

func (a *App) CreateLocalFolderNote(title string) (SessionState, error) {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return a.GetSession(), errors.New("local folder is not set")
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Untitled"
	}
	name := safeLocalFileName(title)
	if !strings.HasSuffix(strings.ToLower(name), ".md") {
		name += ".md"
	}
	path := localCollisionPath(filepath.Join(root.Path, name))
	content := "# " + strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)) + "\n\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return a.GetSession(), err
	}
	return a.openPath(path)
}

func (a *App) CreateLocalFolderCanvas(title string) (SessionState, error) {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return a.GetSession(), errors.New("local folder is not set")
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Canvas"
	}
	name := safeLocalFileName(title)
	if !strings.HasSuffix(strings.ToLower(name), ".canvas") {
		name += ".canvas"
	}
	path := localCollisionPath(filepath.Join(root.Path, name))
	content := `{
  "type": "markpad-canvas",
  "version": 1,
  "source": "markpad",
  "elements": [],
  "appState": {
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return a.GetSession(), err
	}
	return a.openPath(path)
}

func safeLocalFileName(title string) string {
	replacer := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "*", "-", "?", "", "\"", "'", "<", "(", ">", ")", "|", "-")
	name := strings.TrimSpace(replacer.Replace(title))
	name = strings.Join(strings.Fields(name), " ")
	if name == "" {
		return "Untitled"
	}
	if len(name) > 80 {
		name = strings.TrimSpace(name[:80])
	}
	return name
}

func localCollisionPath(path string) string {
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return path
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	for i := 1; ; i++ {
		candidate := base + " " + strconv.Itoa(i) + ext
		if _, err := os.Stat(candidate); errors.Is(err, os.ErrNotExist) {
			return candidate
		}
	}
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

type localFolderSearchPlan struct {
	Text                 string
	Terms                []string
	Phrases              []string
	PathFilters          []string
	TitleFilters         []string
	TypeFilters          []string
	TagFilters           []string
	TaskFilters          []string
	ExcludedTerms        []string
	ExcludedPhrases      []string
	ExcludedPathFilters  []string
	ExcludedTitleFilters []string
	ExcludedTypeFilters  []string
	ExcludedTagFilters   []string
	ExcludedTaskFilters  []string
	HasFilters           bool
	HasPhrases           bool
	HasExclusions        bool
	NeedsContent         bool
	NeedsExclusionScan   bool
}

func parseLocalFolderSearchQuery(query string) localFolderSearchPlan {
	fields := localSearchQueryTokens(query)
	textParts := make([]string, 0, len(fields))
	plan := localFolderSearchPlan{}
	for _, field := range fields {
		clean := strings.Trim(strings.TrimSpace(field.Text), `"'`)
		if clean == "" {
			continue
		}
		lower := strings.ToLower(clean)
		negated := strings.HasPrefix(lower, "-") && len(lower) > 1
		if negated {
			clean = strings.TrimPrefix(clean, "-")
			lower = strings.TrimPrefix(lower, "-")
			plan.HasExclusions = true
		}
		if field.Quoted {
			if negated {
				plan.ExcludedPhrases = append(plan.ExcludedPhrases, lower)
				plan.NeedsContent = true
				plan.NeedsExclusionScan = true
			} else {
				plan.Phrases = append(plan.Phrases, lower)
				plan.HasPhrases = true
			}
			continue
		}
		if strings.HasPrefix(lower, "#") && len(lower) > 1 {
			if negated {
				plan.ExcludedTagFilters = append(plan.ExcludedTagFilters, strings.TrimPrefix(lower, "#"))
				plan.NeedsExclusionScan = true
			} else {
				plan.TagFilters = append(plan.TagFilters, strings.TrimPrefix(lower, "#"))
			}
			plan.HasFilters = true
			plan.NeedsContent = true
			continue
		}
		parts := strings.SplitN(lower, ":", 2)
		if len(parts) == 2 && parts[1] != "" {
			key := parts[0]
			value := strings.TrimPrefix(parts[1], "#")
			switch key {
			case "path":
				if negated {
					plan.ExcludedPathFilters = append(plan.ExcludedPathFilters, value)
				} else {
					plan.PathFilters = append(plan.PathFilters, value)
				}
				plan.HasFilters = true
				continue
			case "title":
				if negated {
					plan.ExcludedTitleFilters = append(plan.ExcludedTitleFilters, value)
				} else {
					plan.TitleFilters = append(plan.TitleFilters, value)
				}
				plan.HasFilters = true
				continue
			case "type", "kind":
				if negated {
					plan.ExcludedTypeFilters = append(plan.ExcludedTypeFilters, value)
				} else {
					plan.TypeFilters = append(plan.TypeFilters, value)
				}
				plan.HasFilters = true
				continue
			case "tag":
				if negated {
					plan.ExcludedTagFilters = append(plan.ExcludedTagFilters, value)
					plan.NeedsExclusionScan = true
				} else {
					plan.TagFilters = append(plan.TagFilters, value)
				}
				plan.HasFilters = true
				plan.NeedsContent = true
				continue
			case "task":
				if negated {
					plan.ExcludedTaskFilters = append(plan.ExcludedTaskFilters, value)
					plan.NeedsExclusionScan = true
				} else {
					plan.TaskFilters = append(plan.TaskFilters, value)
				}
				plan.HasFilters = true
				plan.NeedsContent = true
				continue
			}
		}
		if negated {
			plan.ExcludedTerms = append(plan.ExcludedTerms, searchTerms(lower)...)
			plan.NeedsContent = true
			plan.NeedsExclusionScan = true
			continue
		}
		textParts = append(textParts, clean)
	}
	plan.Text = strings.ToLower(strings.Join(textParts, " "))
	plan.Terms = searchTerms(plan.Text)
	return plan
}

type localSearchQueryToken struct {
	Text   string
	Quoted bool
}

func localSearchQueryTokens(query string) []localSearchQueryToken {
	tokens := []localSearchQueryToken{}
	var b strings.Builder
	quoted := false
	flush := func() {
		text := strings.TrimSpace(b.String())
		if text != "" {
			tokens = append(tokens, localSearchQueryToken{Text: text, Quoted: quoted})
		}
		b.Reset()
	}
	for _, r := range strings.TrimSpace(query) {
		if r == '"' {
			if quoted {
				flush()
				quoted = false
			} else {
				if strings.TrimSpace(b.String()) != "-" {
					flush()
				}
				quoted = true
			}
			continue
		}
		if !quoted && (r == ' ' || r == '\t' || r == '\n' || r == '\r') {
			flush()
			continue
		}
		b.WriteRune(r)
	}
	flush()
	return tokens
}

func searchLocalFile(root string, path string, kind string, plan localFolderSearchPlan) (LocalFolderSearchHit, bool) {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		rel = filepath.Base(path)
	}
	title := filepath.Base(path)
	titleLower := strings.ToLower(title)
	relLower := strings.ToLower(filepath.ToSlash(rel))
	typeLower := strings.ToLower(kind + " " + localSearchExtension(path))
	if !localFolderFiltersMatch(relLower, titleLower, typeLower, plan) {
		return LocalFolderSearchHit{}, false
	}
	if localFolderTextHasExcluded(titleLower+"\n"+relLower, plan) {
		return LocalFolderSearchHit{}, false
	}
	metadataTextMatch := localFolderTextMatches(titleLower+"\n"+relLower, plan)
	if metadataTextMatch && !plan.NeedsContent {
		return LocalFolderSearchHit{
			Path:      path,
			RelPath:   filepath.ToSlash(rel),
			Title:     title,
			Kind:      kind,
			Line:      0,
			Snippet:   filepath.ToSlash(rel),
			Score:     localFolderSearchScore(120, plan),
			MatchKind: "path",
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
	textLine := -1
	filterLine := -1
	textSnippet := ""
	filterSnippet := ""
	textTerms := make(map[string]bool, len(plan.Terms))
	textPhrases := make(map[string]bool, len(plan.Phrases))
	matchedTags := make(map[string]bool, len(plan.TagFilters))
	matchedTasks := make(map[string]bool, len(plan.TaskFilters))
	inFence := false
	fenceMarker := ""
	for scanner.Scan() {
		line := scanner.Text()
		lower := strings.ToLower(line)
		taskFilterLine := true
		if marker, ok := localFenceMarker(line); ok {
			if !inFence {
				inFence = true
				fenceMarker = marker
			} else if marker == fenceMarker {
				inFence = false
				fenceMarker = ""
			}
			taskFilterLine = false
		} else if inFence {
			taskFilterLine = false
		}
		if len(plan.Terms) > 0 || len(plan.Phrases) > 0 {
			if localFolderTrackTextMatches(lower, plan, textTerms, textPhrases) && textLine < 0 {
				textLine = lineNo
				textSnippet = strings.TrimSpace(line)
			}
		}
		if textLine < 0 && localFolderTextMatches(lower, plan) && (len(plan.Terms) > 0 || len(plan.Phrases) > 0) {
			textLine = lineNo
			textSnippet = strings.TrimSpace(line)
		}
		if localFolderLineMatchesContentFilters(lower, plan, matchedTags, matchedTasks, taskFilterLine) && filterLine < 0 {
			filterLine = lineNo
			filterSnippet = strings.TrimSpace(line)
		}
		if localFolderTextHasExcluded(lower, plan) || localFolderLineMatchesExcludedContentFilters(lower, plan, taskFilterLine) {
			return LocalFolderSearchHit{}, false
		}
		if !plan.NeedsExclusionScan && (metadataTextMatch || localFolderTextFiltersMatched(plan, textTerms, textPhrases) || (len(plan.Terms) == 0 && len(plan.Phrases) == 0)) && localFolderContentFiltersMatched(plan, matchedTags, matchedTasks) {
			break
		}
		lineNo++
	}
	if !metadataTextMatch && !localFolderTextFiltersMatched(plan, textTerms, textPhrases) && (len(plan.Terms) > 0 || len(plan.Phrases) > 0) {
		return LocalFolderSearchHit{}, false
	}
	if !localFolderContentFiltersMatched(plan, matchedTags, matchedTasks) {
		return LocalFolderSearchHit{}, false
	}
	if textLine >= 0 {
		return LocalFolderSearchHit{
			Path:      path,
			RelPath:   filepath.ToSlash(rel),
			Title:     title,
			Kind:      kind,
			Line:      textLine,
			Snippet:   textSnippet,
			Score:     localFolderSearchScore(maxInt(10, 80-textLine/50), plan),
			MatchKind: "content",
		}, true
	}
	if filterLine >= 0 {
		return LocalFolderSearchHit{
			Path:      path,
			RelPath:   filepath.ToSlash(rel),
			Title:     title,
			Kind:      kind,
			Line:      filterLine,
			Snippet:   filterSnippet,
			Score:     localFolderSearchScore(maxInt(10, 76-filterLine/50), plan),
			MatchKind: "filter",
		}, true
	}
	if metadataTextMatch || plan.HasFilters {
		matchKind := "filter"
		if metadataTextMatch {
			matchKind = "path"
		}
		return LocalFolderSearchHit{
			Path:      path,
			RelPath:   filepath.ToSlash(rel),
			Title:     title,
			Kind:      kind,
			Line:      0,
			Snippet:   filepath.ToSlash(rel),
			Score:     localFolderSearchScore(90, plan),
			MatchKind: matchKind,
		}, true
	}
	return LocalFolderSearchHit{}, false
}

func localFolderFiltersMatch(relLower string, titleLower string, typeLower string, plan localFolderSearchPlan) bool {
	for _, value := range plan.PathFilters {
		if !strings.Contains(relLower, value) {
			return false
		}
	}
	for _, value := range plan.TitleFilters {
		if !strings.Contains(titleLower, value) {
			return false
		}
	}
	for _, value := range plan.TypeFilters {
		if !strings.Contains(typeLower, value) {
			return false
		}
	}
	for _, value := range plan.ExcludedPathFilters {
		if strings.Contains(relLower, value) {
			return false
		}
	}
	for _, value := range plan.ExcludedTitleFilters {
		if strings.Contains(titleLower, value) {
			return false
		}
	}
	for _, value := range plan.ExcludedTypeFilters {
		if strings.Contains(typeLower, value) {
			return false
		}
	}
	return true
}

func localFolderTextHasExcluded(value string, plan localFolderSearchPlan) bool {
	for _, term := range plan.ExcludedTerms {
		if strings.Contains(value, term) {
			return true
		}
	}
	for _, phrase := range plan.ExcludedPhrases {
		if strings.Contains(value, phrase) {
			return true
		}
	}
	return false
}

func localFolderTextMatches(value string, plan localFolderSearchPlan) bool {
	if len(plan.Terms) == 0 && len(plan.Phrases) == 0 {
		return true
	}
	if len(plan.Terms) > 0 && !termsContain(value, plan.Terms) {
		return false
	}
	for _, phrase := range plan.Phrases {
		if !strings.Contains(value, phrase) {
			return false
		}
	}
	return true
}

func localFolderTrackTextMatches(line string, plan localFolderSearchPlan, terms map[string]bool, phrases map[string]bool) bool {
	matched := false
	for _, term := range plan.Terms {
		if strings.Contains(line, term) {
			terms[term] = true
			matched = true
		}
	}
	for _, phrase := range plan.Phrases {
		if strings.Contains(line, phrase) {
			phrases[phrase] = true
			matched = true
		}
	}
	return matched
}

func localFolderTextFiltersMatched(plan localFolderSearchPlan, terms map[string]bool, phrases map[string]bool) bool {
	for _, term := range plan.Terms {
		if !terms[term] {
			return false
		}
	}
	for _, phrase := range plan.Phrases {
		if !phrases[phrase] {
			return false
		}
	}
	return true
}

func localFolderLineMatchesContentFilters(line string, plan localFolderSearchPlan, tags map[string]bool, tasks map[string]bool, taskFilterLine bool) bool {
	matched := false
	for _, tag := range plan.TagFilters {
		if strings.Contains(line, "#"+tag) {
			tags[tag] = true
			matched = true
		}
	}
	for _, task := range plan.TaskFilters {
		if taskFilterLine && localFolderTaskFilterMatchesLine(line, task) {
			tasks[task] = true
			matched = true
		}
	}
	return matched
}

func localFolderLineMatchesExcludedContentFilters(line string, plan localFolderSearchPlan, taskFilterLine bool) bool {
	for _, tag := range plan.ExcludedTagFilters {
		if strings.Contains(line, "#"+tag) {
			return true
		}
	}
	for _, task := range plan.ExcludedTaskFilters {
		if taskFilterLine && localFolderTaskFilterMatchesLine(line, task) {
			return true
		}
	}
	return false
}

func localFolderContentFiltersMatched(plan localFolderSearchPlan, tags map[string]bool, tasks map[string]bool) bool {
	for _, tag := range plan.TagFilters {
		if !tags[tag] {
			return false
		}
	}
	for _, task := range plan.TaskFilters {
		if !tasks[task] {
			return false
		}
	}
	return true
}

func localFolderTaskFilterMatchesLine(line string, filter string) bool {
	trimmed := strings.TrimSpace(line)
	open, done, ok := localTaskLineStatus(trimmed)
	if !ok {
		return false
	}
	switch filter {
	case "open", "todo", "unchecked":
		return open
	case "done", "closed", "checked":
		return done
	default:
		return strings.Contains(trimmed, filter)
	}
}

func localFolderSearchScore(base int, plan localFolderSearchPlan) int {
	if plan.HasFilters {
		return base + 24
	}
	return base
}

func localSearchExtension(path string) string {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	if ext == "" {
		return "file"
	}
	return ext
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
