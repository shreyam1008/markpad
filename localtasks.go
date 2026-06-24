package main

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	localTaskFileCap = 1024 * 1024
	localTaskLimit   = 1000
)

var localTaskAppendFileCandidates = []string{"tasks.md", "Tasks.md", "tasks.markdown", "Tasks.markdown"}

var (
	localTaskLineRE     = regexp.MustCompile(`^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)( |x|X)(\].*)$`)
	localTaskDueTokenRE = regexp.MustCompile(`(?i)^due:\d{4}-\d{2}-\d{2}$`)
)

type LocalFolderTask struct {
	ID         string   `json:"id"`
	SourcePath string   `json:"sourcePath"`
	RelPath    string   `json:"relPath"`
	Title      string   `json:"title"`
	Line       int      `json:"line"`
	Index      int      `json:"index"`
	RawText    string   `json:"rawText"`
	Text       string   `json:"text"`
	Checked    bool     `json:"checked"`
	Due        string   `json:"due"`
	Priority   string   `json:"priority"`
	Waiting    bool     `json:"waiting"`
	Tags       []string `json:"tags"`
}

type LocalFolderTaskScanProfile struct {
	Path          string `json:"path"`
	Missing       bool   `json:"missing"`
	Limit         int    `json:"limit"`
	FileCapBytes  int64  `json:"fileCapBytes"`
	FilesScanned  int    `json:"filesScanned"`
	MarkdownFiles int    `json:"markdownFiles"`
	TaskFiles     int    `json:"taskFiles"`
	SkippedFiles  int    `json:"skippedFiles"`
	SkippedDirs   int    `json:"skippedDirs"`
	OversizeFiles int    `json:"oversizeFiles"`
	ReadErrors    int    `json:"readErrors"`
	Tasks         int    `json:"tasks"`
	OpenTasks     int    `json:"openTasks"`
	DoneTasks     int    `json:"doneTasks"`
	Truncated     bool   `json:"truncated"`
}

func (a *App) ListLocalFolderTasks(limit int) []LocalFolderTask {
	_, tasks := scanLocalFolderTasks(a.GetLocalFolder(), limit, true)
	return tasks
}

func (a *App) GetLocalFolderTaskScanProfile(limit int) LocalFolderTaskScanProfile {
	profile, _ := scanLocalFolderTasks(a.GetLocalFolder(), limit, false)
	return profile
}

func normalizeLocalTaskLimit(limit int) int {
	if limit <= 0 || limit > localTaskLimit {
		return localTaskLimit
	}
	return limit
}

func scanLocalFolderTasks(root LocalFolderInfo, limit int, collect bool) (LocalFolderTaskScanProfile, []LocalFolderTask) {
	limit = normalizeLocalTaskLimit(limit)
	profile := LocalFolderTaskScanProfile{
		Path:         root.Path,
		Missing:      root.Missing,
		Limit:        limit,
		FileCapBytes: localTaskFileCap,
	}
	tasks := make([]LocalFolderTask, 0, minInt(limit, 128))
	if root.Path == "" || root.Missing {
		return profile, tasks
	}
	_ = filepath.WalkDir(root.Path, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			profile.SkippedFiles++
			return nil
		}
		if entry.IsDir() {
			if shouldSkipLocalDir(entry.Name()) && path != root.Path {
				profile.SkippedDirs++
				return filepath.SkipDir
			}
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			profile.SkippedFiles++
			return nil
		}
		profile.FilesScanned++
		if fileKind(path) != "markdown" {
			return nil
		}
		profile.MarkdownFiles++
		if info.Size() > localTaskFileCap {
			profile.SkippedFiles++
			profile.OversizeFiles++
			return nil
		}
		content, err := os.ReadFile(path)
		if err != nil {
			profile.SkippedFiles++
			profile.ReadErrors++
			return nil
		}
		parsed := parseLocalTasks(root.Path, path, string(content))
		if len(parsed) > 0 {
			profile.TaskFiles++
		}
		for _, task := range parsed {
			if profile.Tasks >= limit {
				profile.Truncated = true
				return filepath.SkipAll
			}
			profile.Tasks++
			if task.Checked {
				profile.DoneTasks++
			} else {
				profile.OpenTasks++
			}
			if collect {
				tasks = append(tasks, task)
			}
		}
		if profile.Tasks >= limit {
			profile.Truncated = true
			return filepath.SkipAll
		}
		return nil
	})
	return profile, tasks
}

func (a *App) ToggleLocalFolderTask(id string, checked bool) []LocalFolderTask {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return []LocalFolderTask{}
	}
	path, index, ok := localTaskPathFromID(root.Path, id)
	if !ok {
		return a.ListLocalFolderTasks(localTaskLimit)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return a.ListLocalFolderTasks(localTaskLimit)
	}
	next := toggleLocalTaskAtIndex(string(content), index, checked)
	if next != string(content) {
		_ = localFolderAtomicWrite(path, []byte(next), 0o644)
	}
	return a.ListLocalFolderTasks(localTaskLimit)
}

func (a *App) MoveLocalFolderTask(id string, status string) []LocalFolderTask {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return []LocalFolderTask{}
	}
	if !isLocalTaskMoveStatus(status) {
		return a.ListLocalFolderTasks(localTaskLimit)
	}
	path, index, ok := localTaskPathFromID(root.Path, id)
	if !ok {
		return a.ListLocalFolderTasks(localTaskLimit)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return a.ListLocalFolderTasks(localTaskLimit)
	}
	next := setLocalTaskStatusAtIndex(string(content), index, status, time.Now())
	if next != string(content) {
		_ = localFolderAtomicWrite(path, []byte(next), 0o644)
	}
	return a.ListLocalFolderTasks(localTaskLimit)
}

func (a *App) AppendLocalFolderTask(line string) (SessionState, error) {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return a.GetSession(), errors.New("local folder is not set")
	}
	line = canonicalLocalTaskAppendLine(line)
	if line == "" {
		return a.GetSession(), errors.New("task line is empty")
	}
	path := localTaskAppendPath(root.Path)
	content := "# Tasks\n\n"
	if data, err := os.ReadFile(path); err == nil {
		content = string(data)
	}
	content = strings.TrimRight(content, " \t\r\n")
	if content == "" {
		content = "# Tasks"
	}
	content += "\n" + line + "\n"
	if err := localFolderAtomicWrite(path, []byte(content), 0o644); err != nil {
		return a.GetSession(), err
	}
	return a.openPath(path)
}

func (a *App) OpenLocalTaskFile() (SessionState, error) {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return a.GetSession(), errors.New("local folder is not set")
	}
	path, err := ensureLocalTaskFile(root.Path)
	if err != nil {
		return a.GetSession(), err
	}
	if a.ctx == nil {
		return a.openLocalTaskFileWithoutWindowTitle(path)
	}
	return a.openPath(path)
}

func ensureLocalTaskFile(root string) (string, error) {
	path := localTaskAppendPath(root)
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return "", errors.New("task file path is a folder")
		}
		return path, nil
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if err := localFolderAtomicWrite(path, []byte("# Tasks\n\n"), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) openLocalTaskFileWithoutWindowTitle(path string) (SessionState, error) {
	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return a.GetSession(), err
	}
	doc := a.sess.AddFile(path, string(data))
	a.sess.AddRecent(path)
	_ = a.store.WriteDraft(doc, string(data))
	_ = a.store.SaveSnapshot(doc.ID, string(data), "open")
	_ = a.store.Save(a.sess)
	return a.GetSession(), nil
}

func localTaskAppendPath(root string) string {
	for _, name := range localTaskAppendFileCandidates {
		path := filepath.Join(root, name)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	if entries, err := os.ReadDir(root); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			lowerName := strings.ToLower(entry.Name())
			if lowerName == "tasks.md" || lowerName == "tasks.markdown" {
				return filepath.Join(root, entry.Name())
			}
		}
	}
	return filepath.Join(root, "tasks.md")
}

func canonicalLocalTaskAppendLine(line string) string {
	line = strings.TrimSpace(line)
	if line == "" {
		return ""
	}
	match := localTaskLineRE.FindStringSubmatch(line)
	if match == nil {
		return "- [ ] " + line
	}
	box := " "
	if strings.EqualFold(match[2], "x") {
		box = "x"
	}
	tail := strings.TrimSpace(strings.TrimPrefix(match[3], "]"))
	if tail == "" {
		return "- [" + box + "]"
	}
	return "- [" + box + "] " + tail
}

func parseLocalTasks(root string, path string, content string) []LocalFolderTask {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		rel = filepath.Base(path)
	}
	rel = filepath.ToSlash(rel)
	lines := strings.Split(content, "\n")
	tasks := make([]LocalFolderTask, 0)
	inFence := false
	fenceMarker := ""
	taskIndex := 0
	for lineNo, line := range lines {
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
		match := localTaskLineRE.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		tail := strings.TrimSpace(strings.TrimPrefix(match[3], "]"))
		text, due, priority, waiting, tags := parseLocalTaskMetadata(tail)
		tasks = append(tasks, LocalFolderTask{
			ID:         rel + "#" + strconv.Itoa(taskIndex),
			SourcePath: path,
			RelPath:    rel,
			Title:      filepath.Base(path),
			Line:       lineNo,
			Index:      taskIndex,
			RawText:    line,
			Text:       text,
			Checked:    strings.EqualFold(match[2], "x"),
			Due:        due,
			Priority:   priority,
			Waiting:    waiting,
			Tags:       tags,
		})
		taskIndex++
	}
	return tasks
}

func toggleLocalTaskAtIndex(markdown string, taskIndex int, checked bool) string {
	lines := strings.Split(markdown, "\n")
	inFence := false
	fenceMarker := ""
	current := 0
	for i, line := range lines {
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
		match := localTaskLineRE.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		if current == taskIndex {
			box := " "
			if checked {
				box = "x"
			}
			lines[i] = match[1] + box + match[3]
			return strings.Join(lines, "\n")
		}
		current++
	}
	return markdown
}

func setLocalTaskStatusAtIndex(markdown string, taskIndex int, status string, now time.Time) string {
	if !isLocalTaskMoveStatus(status) {
		return markdown
	}
	lines := strings.Split(markdown, "\n")
	inFence := false
	fenceMarker := ""
	current := 0
	for i, line := range lines {
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
		if localTaskLineRE.FindStringSubmatch(line) == nil {
			continue
		}
		if current == taskIndex {
			lines[i] = localTaskLineWithStatus(line, status, now)
			return strings.Join(lines, "\n")
		}
		current++
	}
	return markdown
}

func localTaskLineWithStatus(line string, status string, now time.Time) string {
	match := localTaskLineRE.FindStringSubmatch(line)
	if match == nil || !isLocalTaskMoveStatus(status) {
		return line
	}
	body := strings.TrimSpace(strings.TrimPrefix(match[3], "]"))
	fields := strings.Fields(body)
	kept := make([]string, 0, len(fields)+1)
	for _, field := range fields {
		lower := strings.ToLower(field)
		if localTaskDueTokenRE.MatchString(field) || lower == "@waiting" {
			continue
		}
		kept = append(kept, field)
	}
	switch status {
	case "today":
		kept = append(kept, "due:"+now.Format("2006-01-02"))
	case "upcoming":
		kept = append(kept, "due:"+now.AddDate(0, 0, 1).Format("2006-01-02"))
	case "waiting":
		kept = append(kept, "@waiting")
	}
	box := " "
	if status == "done" {
		box = "x"
	}
	tail := strings.Join(kept, " ")
	if tail == "" {
		return match[1] + box + "]"
	}
	return match[1] + box + "] " + tail
}

func isLocalTaskMoveStatus(status string) bool {
	switch status {
	case "today", "upcoming", "waiting", "done":
		return true
	default:
		return false
	}
}

func localTaskLineStatus(line string) (open bool, done bool, ok bool) {
	match := localTaskLineRE.FindStringSubmatch(line)
	if match == nil {
		return false, false, false
	}
	if strings.EqualFold(match[2], "x") {
		return false, true, true
	}
	return true, false, true
}

func parseLocalTaskMetadata(raw string) (string, string, string, bool, []string) {
	parts := strings.Fields(raw)
	kept := make([]string, 0, len(parts))
	tags := make([]string, 0)
	due := ""
	priority := ""
	waiting := false
	for _, part := range parts {
		lower := strings.ToLower(part)
		switch {
		case strings.HasPrefix(lower, "due:") && len(part) == len("due:2006-01-02"):
			due = strings.TrimPrefix(part, "due:")
		case strings.HasPrefix(part, "#") && len(part) > 1:
			tags = append(tags, strings.TrimPrefix(part, "#"))
			kept = append(kept, part)
		case lower == "@waiting":
			waiting = true
		case strings.HasPrefix(lower, "!"):
			priority = normalizeLocalTaskPriority(strings.TrimPrefix(lower, "!"))
		default:
			kept = append(kept, part)
		}
	}
	text := strings.TrimSpace(strings.Join(kept, " "))
	if text == "" {
		text = strings.TrimSpace(raw)
	}
	return text, due, priority, waiting, tags
}

func normalizeLocalTaskPriority(value string) string {
	switch value {
	case "h", "high":
		return "high"
	case "m", "med", "medium":
		return "med"
	case "l", "low":
		return "low"
	default:
		return ""
	}
}

func localFenceMarker(line string) (string, bool) {
	trimmed := strings.TrimSpace(line)
	if strings.HasPrefix(trimmed, "```") {
		return "```", true
	}
	if strings.HasPrefix(trimmed, "~~~") {
		return "~~~", true
	}
	return "", false
}

func splitLocalTaskID(id string) (string, int, bool) {
	pos := strings.LastIndex(id, "#")
	if pos <= 0 || pos >= len(id)-1 {
		return "", 0, false
	}
	index, err := strconv.Atoi(id[pos+1:])
	if err != nil || index < 0 {
		return "", 0, false
	}
	return id[:pos], index, true
}

func localTaskPathFromID(rootPath string, id string) (string, int, bool) {
	rel, index, ok := splitLocalTaskID(id)
	if !ok {
		return "", 0, false
	}
	cleanRel := filepath.Clean(filepath.FromSlash(rel))
	if cleanRel == "." || filepath.IsAbs(cleanRel) || cleanRel == ".." || strings.HasPrefix(cleanRel, ".."+string(filepath.Separator)) {
		return "", 0, false
	}
	rootAbs, err := filepath.Abs(rootPath)
	if err != nil {
		return "", 0, false
	}
	pathAbs, err := filepath.Abs(filepath.Join(rootAbs, cleanRel))
	if err != nil {
		return "", 0, false
	}
	if pathAbs != rootAbs && !strings.HasPrefix(pathAbs, rootAbs+string(filepath.Separator)) {
		return "", 0, false
	}
	return pathAbs, index, true
}
