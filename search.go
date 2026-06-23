package main

import (
	"sort"
	"strings"
	"unicode/utf8"
)

const searchContentCap = 2 * 1024 * 1024

type LoadedSearchHit struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Path        string `json:"path"`
	Kind        string `json:"kind"`
	Dirty       bool   `json:"dirty"`
	Score       int    `json:"score"`
	MatchIndex  int    `json:"matchIndex"`
	MatchLength int    `json:"matchLength"`
	Line        int    `json:"line"`
	Snippet     string `json:"snippet"`
}

func (a *App) SearchLoadedDocuments(query string, activeID string, activeContent string, limit int) []LoadedSearchHit {
	if a == nil || a.sess == nil || a.store == nil {
		return []LoadedSearchHit{}
	}
	if limit <= 0 || limit > 80 {
		limit = 40
	}
	q := strings.ToLower(strings.TrimSpace(query))
	terms := searchTerms(q)
	hits := make([]LoadedSearchHit, 0, len(a.sess.Documents))
	for _, doc := range a.sess.Documents {
		kind := fileKind(doc.Path)
		content := ""
		if !isReadOnlyPath(doc.Path) {
			if doc.ID == activeID {
				content = activeContent
			} else if draft, err := a.store.ReadDraft(doc); err == nil {
				content = draft
			}
			if len(content) > searchContentCap {
				content = content[:searchContentCap]
			}
		}
		hit, ok := scoreLoadedDocument(doc.ID, doc.Title, doc.Path, kind, doc.Dirty, content, q, terms)
		if ok {
			hits = append(hits, hit)
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Score == hits[j].Score {
			return strings.ToLower(hits[i].Title) < strings.ToLower(hits[j].Title)
		}
		return hits[i].Score > hits[j].Score
	})
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits
}

func searchTerms(query string) []string {
	parts := strings.Fields(query)
	if len(parts) > 8 {
		parts = parts[:8]
	}
	return parts
}

func scoreLoadedDocument(id string, title string, path string, kind string, dirty bool, content string, query string, terms []string) (LoadedSearchHit, bool) {
	if strings.TrimSpace(title) == "" {
		title = "Untitled"
	}
	displayPath := path
	if strings.TrimSpace(displayPath) == "" {
		displayPath = "Draft"
	}
	titleLower := strings.ToLower(title)
	pathLower := strings.ToLower(displayPath)
	bodyLower := strings.ToLower(content)
	haystack := titleLower + "\n" + pathLower + "\n" + bodyLower
	for _, term := range terms {
		if !strings.Contains(haystack, term) {
			return LoadedSearchHit{}, false
		}
	}
	score := 0
	if query == "" {
		score = 1
	}
	if query != "" && strings.Contains(titleLower, query) {
		score += 120
	}
	if query != "" && strings.Contains(pathLower, query) {
		score += 70
	}
	matchIndex, matchLength := firstContentMatch(bodyLower, query, terms)
	if matchIndex >= 0 {
		score += 40 + maxInt(0, 30-(matchIndex/4000))
	}
	for _, term := range terms {
		if strings.Contains(titleLower, term) {
			score += 18
		}
		if strings.Contains(pathLower, term) {
			score += 10
		}
		if strings.Contains(bodyLower, term) {
			score += 4
		}
	}
	if score <= 0 && len(terms) > 0 {
		return LoadedSearchHit{}, false
	}
	return LoadedSearchHit{
		ID:          id,
		Title:       title,
		Path:        displayPath,
		Kind:        kind,
		Dirty:       dirty,
		Score:       score,
		MatchIndex:  utf16Index(content, matchIndex),
		MatchLength: utf16Len(contentSliceForLength(content, matchIndex, matchLength)),
		Line:        lineForByteIndex(content, matchIndex),
		Snippet:     searchSnippet(content, matchIndex, matchLength),
	}, true
}

func firstContentMatch(lowerContent string, query string, terms []string) (int, int) {
	if query != "" {
		if idx := strings.Index(lowerContent, query); idx >= 0 {
			return idx, len(query)
		}
	}
	for _, term := range terms {
		if idx := strings.Index(lowerContent, term); idx >= 0 {
			return idx, len(term)
		}
	}
	return -1, 0
}

func searchSnippet(content string, matchIndex int, matchLength int) string {
	if matchIndex < 0 || matchIndex >= len(content) {
		return ""
	}
	start := maxInt(0, matchIndex-80)
	end := minInt(len(content), matchIndex+maxInt(matchLength, 1)+140)
	snippet := strings.Join(strings.Fields(content[start:end]), " ")
	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(content) {
		snippet += "..."
	}
	return snippet
}

func lineForByteIndex(content string, index int) int {
	if index < 0 {
		return 0
	}
	line := 0
	for i := 0; i < index && i < len(content); i++ {
		if content[i] == '\n' {
			line++
		}
	}
	return line
}

func utf16Index(content string, byteIndex int) int {
	if byteIndex < 0 {
		return -1
	}
	units := 0
	for i, r := range content {
		if i >= byteIndex {
			break
		}
		units += utf16RuneLen(r)
	}
	return units
}

func utf16Len(content string) int {
	units := 0
	for len(content) > 0 {
		r, size := utf8.DecodeRuneInString(content)
		units += utf16RuneLen(r)
		content = content[size:]
	}
	return units
}

func contentSliceForLength(content string, start int, length int) string {
	if start < 0 || length <= 0 || start >= len(content) {
		return ""
	}
	return content[start:minInt(len(content), start+length)]
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func utf16RuneLen(r rune) int {
	if r <= 0xFFFF {
		return 1
	}
	return 2
}
