package workspace

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	MaxFiles              = 10_000
	MaxFileSize           = 2 << 20
	MaxVisitedEntries     = 100_000
	MaxDepth              = 32
	MaxSearchBytes        = 64 << 20
	MaxSearchResults      = 200
	MaxSearchQueryRunes   = 256
	MaxSearchPreviewRunes = 400

	binaryProbeSize = 8192
)

var errScanLimit = errors.New("workspace scan limit reached")

var excludedDirectories = map[string]struct{}{
	"build":        {},
	"coverage":     {},
	"dist":         {},
	"node_modules": {},
	"obj":          {},
	"out":          {},
	"target":       {},
	"vendor":       {},
}

var supportedExtensions = map[string]string{
	".md":         "markdown",
	".markdown":   "markdown",
	".mdx":        "markdown",
	".txt":        "text",
	".log":        "text",
	".csv":        "text",
	".tsv":        "text",
	".py":         "code",
	".js":         "code",
	".ts":         "code",
	".jsx":        "code",
	".tsx":        "code",
	".go":         "code",
	".rs":         "code",
	".rb":         "code",
	".lua":        "code",
	".sh":         "code",
	".bash":       "code",
	".zsh":        "code",
	".fish":       "code",
	".json":       "code",
	".yaml":       "code",
	".yml":        "code",
	".xml":        "code",
	".toml":       "code",
	".ini":        "code",
	".cfg":        "code",
	".conf":       "code",
	".properties": "code",
	".html":       "code",
	".htm":        "code",
	".css":        "code",
	".scss":       "code",
	".less":       "code",
	".svg":        "code",
	".vue":        "code",
	".svelte":     "code",
	".sql":        "code",
	".c":          "code",
	".cpp":        "code",
	".h":          "code",
	".hpp":        "code",
	".java":       "code",
	".cs":         "code",
	".kt":         "code",
	".swift":      "code",
	".dart":       "code",
	".r":          "code",
	".pl":         "code",
	".diff":       "code",
	".patch":      "code",
	".php":        "code",
	".ex":         "code",
	".exs":        "code",
	".zig":        "code",
	".nim":        "code",
	".ps1":        "code",
	".bat":        "code",
	".cmd":        "code",
	".gradle":     "code",
	".tf":         "code",
	".hcl":        "code",
}

var creatableExtensions = map[string]struct{}{
	".md":       {},
	".markdown": {},
	".mdx":      {},
	".txt":      {},
}

type File struct {
	Path     string
	Relative string
	Name     string
	Kind     string
	Size     int64
	Modified time.Time
}

type State struct {
	Root      string
	Name      string
	Files     []File
	Truncated bool
}

type SearchResult struct {
	Path       string
	Relative   string
	Line       int
	Column     int
	Text       string
	MatchStart int
	MatchEnd   int
}

type scanLimits struct {
	files   int
	entries int
	depth   int
}

// Scan returns a deterministic, bounded inventory of searchable text files.
func Scan(root string) (State, error) {
	return scan(root, scanLimits{files: MaxFiles, entries: MaxVisitedEntries, depth: MaxDepth})
}

func scan(root string, limits scanLimits) (State, error) {
	root, err := NormalizeRoot(root)
	if err != nil {
		return State{Files: []File{}}, err
	}

	state := State{
		Root:  root,
		Name:  filepath.Base(root),
		Files: make([]File, 0, min(limits.files, 256)),
	}
	visited := 0
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if path == root {
				return walkErr
			}
			if entry != nil && entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if path == root {
			return nil
		}

		visited++
		if visited > limits.entries {
			state.Truncated = true
			return errScanLimit
		}

		relative, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			if shouldSkipDirectory(entry.Name()) {
				return filepath.SkipDir
			}
			if pathDepth(relative) >= limits.depth {
				state.Truncated = true
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(entry.Name(), ".") {
			return nil
		}

		kind, ok := kindForPath(path)
		if !ok {
			return nil
		}
		info, infoErr := entry.Info()
		if infoErr != nil || !info.Mode().IsRegular() || info.Size() > MaxFileSize {
			return nil
		}
		binary, probeErr := fileLooksBinary(path)
		if probeErr != nil || binary {
			return nil
		}
		if len(state.Files) >= limits.files {
			state.Truncated = true
			return errScanLimit
		}

		state.Files = append(state.Files, File{
			Path:     path,
			Relative: filepath.ToSlash(relative),
			Name:     entry.Name(),
			Kind:     kind,
			Size:     info.Size(),
			Modified: info.ModTime(),
		})
		return nil
	})
	if err != nil && !errors.Is(err, errScanLimit) {
		return State{Files: []File{}}, fmt.Errorf("scan workspace %q: %w", root, err)
	}

	sort.Slice(state.Files, func(i, j int) bool {
		left := strings.ToLower(state.Files[i].Relative)
		right := strings.ToLower(state.Files[j].Relative)
		if left == right {
			return state.Files[i].Relative < state.Files[j].Relative
		}
		return left < right
	})
	return state, nil
}

// Search scans the cached inventory without creating a persistent index. It
// returns the first match on each matching line in deterministic file order.
func Search(ctx context.Context, state State, query string, overrides map[string][]byte) ([]SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" || state.Root == "" {
		return []SearchResult{}, nil
	}
	if strings.ContainsAny(query, "\r\n") {
		return nil, fmt.Errorf("workspace search must fit on one line")
	}
	queryRunes := []rune(query)
	if len(queryRunes) > MaxSearchQueryRunes {
		return nil, fmt.Errorf("workspace search is limited to %d characters", MaxSearchQueryRunes)
	}
	matcher := newFoldMatcher(queryRunes)

	root, err := NormalizeRoot(state.Root)
	if err != nil {
		return nil, err
	}
	results := make([]SearchResult, 0, min(MaxSearchResults, 32))
	searchedBytes := int64(0)
	for _, indexed := range state.Files {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		path, info, valid := validateIndexedFile(root, indexed.Path)
		if !valid {
			continue
		}
		data, overridden := overrides[path]
		searchSize := info.Size()
		if overridden {
			searchSize = int64(len(data))
		}
		if searchSize > MaxFileSize {
			continue
		}
		if searchedBytes+searchSize > MaxSearchBytes {
			break
		}
		searchedBytes += searchSize

		if !overridden {
			var readErr error
			data, readErr = readSearchFile(path)
			if readErr != nil {
				continue
			}
		}
		if !utf8.Valid(data) || looksBinary(data) {
			continue
		}
		content := string(data)
		for lineIndex := 1; ; lineIndex++ {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			line := content
			if newline := strings.IndexByte(content, '\n'); newline >= 0 {
				line = content[:newline]
				content = content[newline+1:]
			} else {
				content = ""
			}
			line = strings.TrimSuffix(line, "\r")
			matchStart, found := matcher.index(line)
			if !found {
				if content == "" {
					break
				}
				continue
			}
			lineRunes := []rune(line)
			matchEnd := matchStart + len(queryRunes)
			preview, previewStart, previewEnd := searchPreview(lineRunes, matchStart, matchEnd)
			results = append(results, SearchResult{
				Path:       path,
				Relative:   indexed.Relative,
				Line:       lineIndex,
				Column:     utf16Length(lineRunes[:matchStart]),
				Text:       preview,
				MatchStart: previewStart,
				MatchEnd:   previewEnd,
			})
			if len(results) >= MaxSearchResults {
				return results, nil
			}
			if content == "" {
				break
			}
		}
	}
	return results, nil
}

// CreateFile creates a new Markdown or plain-text file below root. Missing
// parent directories are created, but existing files are never overwritten.
func CreateFile(root string, relativePath string) (string, error) {
	root, err := NormalizeRoot(root)
	if err != nil {
		return "", err
	}
	relative, err := normalizeCreatePath(relativePath)
	if err != nil {
		return "", err
	}
	if filepath.Ext(relative) == "" {
		relative += ".md"
	}
	if _, ok := creatableExtensions[strings.ToLower(filepath.Ext(relative))]; !ok {
		return "", fmt.Errorf("workspace files must use .md, .markdown, .mdx, or .txt")
	}
	if err := validateRelativePolicy(relative); err != nil {
		return "", err
	}

	path := filepath.Join(root, relative)
	if _, err := relativeWithin(root, path); err != nil {
		return "", err
	}
	parentRelative, err := filepath.Rel(root, filepath.Dir(path))
	if err != nil {
		return "", fmt.Errorf("resolve workspace parent: %w", err)
	}
	if err := ensurePathComponents(root, parentRelative, true, true); err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("create workspace folder: %w", err)
	}
	if err := ensurePathComponents(root, parentRelative, false, true); err != nil {
		return "", err
	}

	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			return "", fmt.Errorf("workspace file already exists: %s", filepath.Base(path))
		}
		return "", fmt.Errorf("create workspace file: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return "", fmt.Errorf("finish workspace file: %w", err)
	}
	return path, nil
}

// ValidateMember resolves a deletion candidate and verifies that it is a
// visible, supported regular file inside root with no symlink components.
func ValidateMember(root string, path string) (string, error) {
	root, err := NormalizeRoot(root)
	if err != nil {
		return "", err
	}
	path, info, valid := validateIndexedFile(root, path)
	if !valid {
		return "", fmt.Errorf("file is not a safe workspace member")
	}
	binary, err := fileLooksBinary(path)
	if err != nil {
		return "", fmt.Errorf("inspect workspace file: %w", err)
	}
	if binary || info.Size() > MaxFileSize {
		return "", fmt.Errorf("file is not a searchable workspace member")
	}
	return path, nil
}

// ValidateDeleteTarget verifies an already-open file without following any
// symlink supplied by the caller.
func ValidateDeleteTarget(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("file path is required")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve file path: %w", err)
	}
	abs = filepath.Clean(abs)
	if err := ensureAbsolutePathHasNoSymlinks(abs); err != nil {
		return "", err
	}
	info, err := os.Lstat(abs)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("only regular files can be deleted")
	}
	return abs, nil
}

func NormalizeRoot(root string) (string, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return "", fmt.Errorf("workspace folder is required")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve workspace folder: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", fmt.Errorf("resolve workspace folder: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("open workspace folder: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("workspace path is not a folder")
	}
	return filepath.Clean(resolved), nil
}

func normalizeCreatePath(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("workspace file name is required")
	}
	value = strings.ReplaceAll(value, "\\", "/")
	if strings.HasPrefix(value, "/") || strings.Contains(value, ":") {
		return "", fmt.Errorf("workspace file name must be relative")
	}
	parts := strings.Split(value, "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "", fmt.Errorf("workspace file name contains an unsafe path component")
		}
	}
	relative := filepath.FromSlash(strings.Join(parts, "/"))
	if filepath.IsAbs(relative) || filepath.VolumeName(relative) != "" {
		return "", fmt.Errorf("workspace file name must be relative")
	}
	return filepath.Clean(relative), nil
}

func validateIndexedFile(root string, path string) (string, os.FileInfo, bool) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", nil, false
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", nil, false
	}
	abs = filepath.Clean(abs)
	relative, err := relativeWithin(root, abs)
	if err != nil || validateRelativePolicy(relative) != nil {
		return "", nil, false
	}
	if _, ok := kindForPath(abs); !ok {
		return "", nil, false
	}
	if err := ensurePathComponents(root, relative, false, false); err != nil {
		return "", nil, false
	}
	info, err := os.Lstat(abs)
	if err != nil || !info.Mode().IsRegular() || info.Size() > MaxFileSize {
		return "", nil, false
	}
	return abs, info, true
}

func relativeWithin(root string, path string) (string, error) {
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return "", fmt.Errorf("resolve workspace path: %w", err)
	}
	if relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes the workspace folder")
	}
	return relative, nil
}

func validateRelativePolicy(relative string) error {
	parts := strings.Split(filepath.Clean(relative), string(filepath.Separator))
	for index, part := range parts {
		if part == "" || part == "." || part == ".." || strings.HasPrefix(part, ".") {
			return fmt.Errorf("hidden or unsafe workspace paths are not allowed")
		}
		if index < len(parts)-1 {
			if _, excluded := excludedDirectories[strings.ToLower(part)]; excluded {
				return fmt.Errorf("excluded workspace folders are not allowed")
			}
		}
	}
	return nil
}

func ensurePathComponents(root string, relative string, allowMissing bool, finalDirectory bool) error {
	if relative == "." || relative == "" {
		return nil
	}
	current := root
	parts := strings.Split(filepath.Clean(relative), string(filepath.Separator))
	for index, part := range parts {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if errors.Is(err, os.ErrNotExist) && allowMissing {
			return nil
		}
		if err != nil {
			return fmt.Errorf("inspect workspace path: %w", err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("workspace symlinks are not allowed")
		}
		if (index < len(parts)-1 || finalDirectory) && !info.IsDir() {
			return fmt.Errorf("workspace parent is not a folder")
		}
	}
	return nil
}

func ensureAbsolutePathHasNoSymlinks(path string) error {
	current := filepath.Clean(path)
	components := make([]string, 0, 8)
	for {
		components = append(components, current)
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	for index := len(components) - 1; index >= 0; index-- {
		info, err := os.Lstat(components[index])
		if err != nil {
			return fmt.Errorf("inspect file path: %w", err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink files cannot be deleted")
		}
	}
	return nil
}

func shouldSkipDirectory(name string) bool {
	if strings.HasPrefix(name, ".") {
		return true
	}
	_, excluded := excludedDirectories[strings.ToLower(name)]
	return excluded
}

func pathDepth(relative string) int {
	if relative == "." || relative == "" {
		return 0
	}
	return len(strings.Split(filepath.Clean(relative), string(filepath.Separator)))
}

func kindForPath(path string) (string, bool) {
	extension := strings.ToLower(filepath.Ext(path))
	if extension == "" {
		return "text", true
	}
	kind, ok := supportedExtensions[extension]
	return kind, ok
}

func fileLooksBinary(path string) (bool, error) {
	file, err := os.Open(path)
	if err != nil {
		return false, err
	}
	defer file.Close()
	probe := make([]byte, binaryProbeSize)
	count, err := file.Read(probe)
	if err != nil && !errors.Is(err, io.EOF) {
		return false, err
	}
	return looksBinary(probe[:count]), nil
}

func looksBinary(data []byte) bool {
	for _, value := range data {
		if value == 0 {
			return true
		}
	}
	return false
}

func readSearchFile(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, MaxFileSize+1))
	if err != nil {
		return nil, err
	}
	if len(data) > MaxFileSize {
		return nil, fmt.Errorf("workspace file exceeds search limit")
	}
	return data, nil
}

type foldMatcher struct {
	needle []rune
	prefix []int
	ascii  bool
}

func newFoldMatcher(needle []rune) foldMatcher {
	matcher := foldMatcher{
		needle: make([]rune, len(needle)),
		prefix: make([]int, len(needle)),
		ascii:  true,
	}
	for index, value := range needle {
		matcher.needle[index] = unicode.ToLower(value)
		if value > unicode.MaxASCII {
			matcher.ascii = false
		}
	}
	for index, matched := 1, 0; index < len(matcher.needle); index++ {
		for matched > 0 && matcher.needle[index] != matcher.needle[matched] {
			matched = matcher.prefix[matched-1]
		}
		if matcher.needle[index] == matcher.needle[matched] {
			matched++
		}
		matcher.prefix[index] = matched
	}
	return matcher
}

func (m foldMatcher) index(value string) (int, bool) {
	matched := 0
	runeIndex := 0
	for _, current := range value {
		if m.ascii && current > unicode.MaxASCII {
			matched = 0
			runeIndex++
			continue
		}
		if current <= unicode.MaxASCII {
			if current >= 'A' && current <= 'Z' {
				current += 'a' - 'A'
			}
		} else {
			current = unicode.ToLower(current)
		}
		for matched > 0 && current != m.needle[matched] {
			matched = m.prefix[matched-1]
		}
		if current == m.needle[matched] {
			matched++
		}
		if matched == len(m.needle) {
			return runeIndex - len(m.needle) + 1, true
		}
		runeIndex++
	}
	return 0, false
}

func searchPreview(line []rune, matchStart int, matchEnd int) (string, int, int) {
	start := 0
	end := len(line)
	if len(line) > MaxSearchPreviewRunes {
		start = max(0, matchStart-120)
		end = min(len(line), start+MaxSearchPreviewRunes)
		if matchEnd > end {
			end = matchEnd
			start = max(0, end-MaxSearchPreviewRunes)
		}
		if end == len(line) {
			start = max(0, end-MaxSearchPreviewRunes)
		}
	}

	prefix := start > 0
	suffix := end < len(line)
	preview := make([]rune, 0, end-start+2)
	if prefix {
		preview = append(preview, '…')
	}
	preview = append(preview, line[start:end]...)
	if suffix {
		preview = append(preview, '…')
	}

	previewStart := utf16Length(line[start:matchStart])
	if prefix {
		previewStart++
	}
	previewEnd := previewStart + utf16Length(line[matchStart:matchEnd])
	return string(preview), previewStart, previewEnd
}

func utf16Length(value []rune) int {
	length := 0
	for _, current := range value {
		if current > 0xffff {
			length += 2
		} else {
			length++
		}
	}
	return length
}
