package vault

import (
	"os"
	"path/filepath"
	"runtime/debug"
	"sort"
	"strings"
	"sync"
)

const (
	defaultListNotesPageLimit = 500
	maxListNotesPageLimit     = 1000
	notePageCacheLimit        = 4
	notePageRequestIDMaxLen   = 128
)

type notePageCandidate struct {
	folder       NoteFolder
	abs          string
	rel          string
	title        string
	siblingOrder int
	index        int
	info         os.FileInfo
}

func normalizeListNotesPageLimit(request ListNotesPageRequest) int {
	limit := request.Limit
	if limit <= 0 {
		limit = request.ChunkSize
	}
	if limit <= 0 {
		return defaultListNotesPageLimit
	}
	if limit > maxListNotesPageLimit {
		return maxListNotesPageLimit
	}
	return limit
}

func normalizeListNotesPageOffset(offset int) int {
	if offset < 0 {
		return 0
	}
	return offset
}

func (v *Vault) ListNotesPage(request ListNotesPageRequest) (ListNotesPageResponse, error) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	v.hydratePersistedNoteMetaCache()

	limit := normalizeListNotesPageLimit(request)
	offset := normalizeListNotesPageOffset(request.Offset)
	cacheKey := listNotesPageCacheKey(request)

	candidates, err := v.listNotePageCandidatesForRequestLocked(request, cacheKey)
	if err != nil {
		return ListNotesPageResponse{}, err
	}

	total := len(candidates)
	if offset > total {
		offset = total
	}
	nextOffset := offset + limit
	if nextOffset > total {
		nextOffset = total
	}

	notes := v.readNotePageMetas(candidates[offset:nextOffset])
	hasMore := nextOffset < total
	if !hasMore {
		if cacheKey != "" {
			v.deleteNotePageCache(cacheKey)
		}
		if total > 1000 {
			v.releaseLargeNoteListMemory()
		}
	}
	return ListNotesPageResponse{
		Notes:      notes,
		NextOffset: nextOffset,
		Done:       !hasMore,
		Total:      total,
		HasMore:    hasMore,
	}, nil
}

func (v *Vault) listNotePageCandidatesForRequestLocked(request ListNotesPageRequest, cacheKey string) ([]notePageCandidate, error) {
	if cacheKey != "" {
		if candidates, ok := v.getNotePageCache(cacheKey); ok {
			return candidates, nil
		}
	}

	candidates, err := v.listNotePageCandidatesLocked()
	if err != nil {
		return nil, err
	}
	candidates = filterNotePageCandidates(candidates, request)
	candidates = sortNotePageCandidates(candidates, request.Sort)
	if cacheKey != "" {
		v.putNotePageCache(cacheKey, candidates)
	}
	return candidates, nil
}

func listNotesPageCacheKey(request ListNotesPageRequest) string {
	requestID := strings.TrimSpace(request.RequestID)
	if requestID == "" || len(requestID) > notePageRequestIDMaxLen {
		return ""
	}
	folderParts := make([]string, 0, len(request.Filter.Folders)+1)
	if request.Filter.Folder != "" {
		folderParts = append(folderParts, string(request.Filter.Folder))
	}
	for _, folder := range request.Filter.Folders {
		if folder != "" {
			folderParts = append(folderParts, string(folder))
		}
	}
	sort.Strings(folderParts)
	return strings.Join([]string{
		requestID,
		strings.ToLower(strings.TrimSpace(request.Query)),
		strings.ToLower(strings.TrimSpace(request.Sort)),
		strings.Join(folderParts, ","),
	}, "\x00")
}

func (v *Vault) getNotePageCache(key string) ([]notePageCandidate, bool) {
	v.notePageMu.Lock()
	defer v.notePageMu.Unlock()
	candidates, ok := v.notePageCache[key]
	return candidates, ok
}

func (v *Vault) putNotePageCache(key string, candidates []notePageCandidate) {
	v.notePageMu.Lock()
	defer v.notePageMu.Unlock()
	if v.notePageCache == nil {
		v.notePageCache = map[string][]notePageCandidate{}
	}
	if _, exists := v.notePageCache[key]; !exists {
		v.notePageOrder = append(v.notePageOrder, key)
	}
	v.notePageCache[key] = candidates
	for len(v.notePageOrder) > notePageCacheLimit {
		oldest := v.notePageOrder[0]
		v.notePageOrder = v.notePageOrder[1:]
		delete(v.notePageCache, oldest)
	}
}

func (v *Vault) deleteNotePageCache(key string) {
	v.notePageMu.Lock()
	defer v.notePageMu.Unlock()
	delete(v.notePageCache, key)
	for i, existing := range v.notePageOrder {
		if existing == key {
			v.notePageOrder = append(v.notePageOrder[:i], v.notePageOrder[i+1:]...)
			return
		}
	}
}

func (v *Vault) invalidateNotePageCache() {
	v.notePageMu.Lock()
	v.notePageCache = map[string][]notePageCandidate{}
	v.notePageOrder = nil
	v.notePageMu.Unlock()
}

func (v *Vault) releaseLargeNoteListMemory() {
	v.metaCacheMu.Lock()
	if len(v.metaCache) > 1000 {
		v.metaCache = map[string]noteMetaCacheEntry{}
		v.metaCacheGen++
	}
	v.metaCacheMu.Unlock()
	debug.FreeOSMemory()
}

func (v *Vault) listNotePageCandidatesLocked() ([]notePageCandidate, error) {
	files := []notePageCandidate{}
	siblingOrders := map[string]int{}

	for _, folder := range AllFolders {
		folderRoot, err := v.folderRoot(folder)
		if err != nil {
			return nil, err
		}
		isPrimaryRoot := folder == FolderInbox && filepath.Clean(folderRoot) == filepath.Clean(v.root)
		err = filepath.WalkDir(folderRoot, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				if isSkippableWalkErr(err) {
					return nil
				}
				return err
			}
			if d.IsDir() {
				if strings.HasPrefix(d.Name(), ".") && path != folderRoot {
					return filepath.SkipDir
				}
				if isFormDirName(d.Name()) {
					return filepath.SkipDir
				}
				if isPrimaryRoot && path != folderRoot {
					parent := filepath.Dir(path)
					if filepath.Clean(parent) == filepath.Clean(folderRoot) {
						if shouldHidePrimaryRootName(d.Name()) {
							return filepath.SkipDir
						}
					}
				}
				return nil
			}
			if isPrimaryRoot {
				parent := filepath.Dir(path)
				if filepath.Clean(parent) == filepath.Clean(folderRoot) {
					if shouldHidePrimaryRootName(d.Name()) {
						return filepath.SkipDir
					}
				}
			}
			if !strings.EqualFold(filepath.Ext(d.Name()), ".md") && !isExcalidrawName(d.Name()) {
				return nil
			}
			rel, err := filepath.Rel(v.root, path)
			if err != nil {
				return err
			}
			rel = filepath.ToSlash(rel)
			dir := filepath.Dir(rel)
			siblingOrder := siblingOrders[dir]
			siblingOrders[dir]++
			files = append(files, notePageCandidate{
				folder:       folder,
				abs:          path,
				rel:          rel,
				title:        strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)),
				siblingOrder: siblingOrder,
				index:        len(files),
			})
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	return files, nil
}

func filterNotePageCandidates(candidates []notePageCandidate, request ListNotesPageRequest) []notePageCandidate {
	folderSet, hasFolderFilter := listNotesFolderFilter(request.Filter)
	query := strings.ToLower(strings.TrimSpace(request.Query))
	if !hasFolderFilter && query == "" {
		return candidates
	}

	out := make([]notePageCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		if hasFolderFilter && !folderSet[candidate.folder] {
			continue
		}
		if query != "" && !candidateMatchesNotePageQuery(candidate, query) {
			continue
		}
		out = append(out, candidate)
	}
	return out
}

func listNotesFolderFilter(filter ListNotesPageFilter) (map[NoteFolder]bool, bool) {
	out := map[NoteFolder]bool{}
	hasFilter := false
	add := func(folder NoteFolder) {
		if folder == "" {
			return
		}
		hasFilter = true
		if IsValidFolder(folder) {
			out[folder] = true
		}
	}
	add(filter.Folder)
	for _, folder := range filter.Folders {
		add(folder)
	}
	return out, hasFilter
}

func candidateMatchesNotePageQuery(candidate notePageCandidate, query string) bool {
	return strings.Contains(strings.ToLower(candidate.rel), query) ||
		strings.Contains(strings.ToLower(candidate.title), query) ||
		strings.Contains(strings.ToLower(string(candidate.folder)), query)
}

func sortNotePageCandidates(candidates []notePageCandidate, rawSort string) []notePageCandidate {
	order := strings.ToLower(strings.TrimSpace(rawSort))
	switch order {
	case "", "none", "manual", "filesystem":
		return candidates
	case "updated-desc", "updated-asc", "created-desc", "created-asc", "size-desc", "size-asc":
		candidates = hydrateNotePageCandidateInfo(candidates)
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		left := candidates[i]
		right := candidates[j]
		if result := compareNotePageCandidates(left, right, order); result != 0 {
			return result < 0
		}
		return left.index < right.index
	})
	return candidates
}

func hydrateNotePageCandidateInfo(candidates []notePageCandidate) []notePageCandidate {
	out := candidates[:0]
	for _, candidate := range candidates {
		info, err := os.Stat(candidate.abs)
		if err != nil {
			continue
		}
		candidate.info = info
		out = append(out, candidate)
	}
	return out
}

func compareNotePageCandidates(left, right notePageCandidate, order string) int {
	switch order {
	case "name-asc", "title-asc":
		return compareLower(left.title, right.title)
	case "name-desc", "title-desc":
		return compareLower(right.title, left.title)
	case "path-asc":
		return compareLower(left.rel, right.rel)
	case "path-desc":
		return compareLower(right.rel, left.rel)
	case "updated-asc", "created-asc":
		return compareInt64(left.info.ModTime().UnixMilli(), right.info.ModTime().UnixMilli())
	case "updated-desc", "created-desc":
		return compareInt64(right.info.ModTime().UnixMilli(), left.info.ModTime().UnixMilli())
	case "size-asc":
		return compareInt64(left.info.Size(), right.info.Size())
	case "size-desc":
		return compareInt64(right.info.Size(), left.info.Size())
	default:
		return 0
	}
}

func compareLower(left, right string) int {
	return strings.Compare(strings.ToLower(left), strings.ToLower(right))
}

func compareInt64(left, right int64) int {
	switch {
	case left < right:
		return -1
	case left > right:
		return 1
	default:
		return 0
	}
}

func (v *Vault) readNotePageMetas(files []notePageCandidate) []NoteMeta {
	if len(files) == 0 {
		return []NoteMeta{}
	}

	results := make([]NoteMeta, len(files))
	ok := make([]bool, len(files))
	limit := noteMetaReadLimit
	if len(files) < limit {
		limit = len(files)
	}
	sem := make(chan struct{}, limit)
	var wg sync.WaitGroup
	for index, file := range files {
		wg.Add(1)
		go func(index int, file notePageCandidate) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			meta, err := v.readMeta(file.folder, file.abs)
			if err != nil {
				return
			}
			meta.SiblingOrder = file.siblingOrder
			results[index] = meta
			ok[index] = true
		}(index, file)
	}
	wg.Wait()

	out := make([]NoteMeta, 0, len(files))
	for index, meta := range results {
		if ok[index] {
			out = append(out, meta)
		}
	}
	return out
}
