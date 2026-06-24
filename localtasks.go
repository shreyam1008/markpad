package main

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

const (
	localTaskFileCap = 1024 * 1024
	localTaskLimit   = 1000
)

var localTaskAppendFileCandidates = []string{"tasks.md", "Tasks.md", "tasks.markdown", "Tasks.markdown"}

var localTaskLineRE = regexp.MustCompile(`^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)( |x|X)(\].*)$`)

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

func (a *App) ListLocalFolderTasks(limit int) []LocalFolderTask {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return []LocalFolderTask{}
	}
	if limit <= 0 || limit > localTaskLimit {
		limit = localTaskLimit
	}
	tasks := make([]LocalFolderTask, 0, minInt(limit, 128))
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
		if len(tasks) >= limit {
			return filepath.SkipAll
		}
		if fileKind(path) != "markdown" {
			return nil
		}
		info, err := entry.Info()
		if err != nil || info.Size() > localTaskFileCap {
			return nil
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		tasks = append(tasks, parseLocalTasks(root.Path, path, string(content))...)
		if len(tasks) >= limit {
			tasks = tasks[:limit]
			return filepath.SkipAll
		}
		return nil
	})
	return tasks
}

func (a *App) ToggleLocalFolderTask(id string, checked bool) []LocalFolderTask {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return []LocalFolderTask{}
	}
	rel, index, ok := splitLocalTaskID(id)
	if !ok {
		return a.ListLocalFolderTasks(localTaskLimit)
	}
	path := filepath.Join(root.Path, filepath.FromSlash(rel))
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

func (a *App) AppendLocalFolderTask(line string) (SessionState, error) {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return a.GetSession(), errors.New("local folder is not set")
	}
	line = strings.TrimSpace(line)
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
