package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	"markpad/internal/session"
)

const (
	maxOpenNoteSearchUnits     = 16 << 20
	maxOpenNoteSearchPageUnits = 1 << 20
	maxOpenNoteSearchPageIDs   = 128
)

type OpenNoteSearchContent struct {
	ID       string `json:"id"`
	Content  string `json:"content"`
	Complete bool   `json:"complete"`
}

type OpenNoteSearchCursor struct {
	ID           string `json:"id"`
	OffsetBytes  int64  `json:"offsetBytes"`
	SourcePath   string `json:"sourcePath"`
	Size         int64  `json:"size"`
	ModTime      string `json:"modTime"`
	TotalUnits   int    `json:"totalUnits"`
	EmittedUnits int    `json:"emittedUnits"`
}

type OpenNoteSearchSnapshot struct {
	Notes      []OpenNoteSearchContent `json:"notes"`
	SkippedIDs []string                `json:"skippedIds"`
	FailedIDs  []string                `json:"failedIds"`
	PendingIDs []string                `json:"pendingIds"`
	NextCursor *OpenNoteSearchCursor   `json:"nextCursor"`
}

// GetOpenNoteSearchSnapshot reads only requested open documents. Search never
// repairs recovery files, changes document metadata, or adopts a source baseline.
// Callers retain partial fragments but search a note only after Complete is true.
// budgetUnits is charged for complete notes, including their earlier fragments.
func (a *App) GetOpenNoteSearchSnapshot(ids []string, budgetUnits int, cursor *OpenNoteSearchCursor) (OpenNoteSearchSnapshot, error) {
	result := OpenNoteSearchSnapshot{
		Notes:      make([]OpenNoteSearchContent, 0),
		SkippedIDs: make([]string, 0),
		FailedIDs:  make([]string, 0),
		PendingIDs: make([]string, 0),
	}
	orderedIDs := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, exists := seen[id]; !exists {
			seen[id] = struct{}{}
			orderedIDs = append(orderedIDs, id)
		}
	}
	if cursor != nil && (len(orderedIDs) == 0 || cursor.ID != orderedIDs[0]) {
		return result, errors.New("open-note search cursor must continue the first requested note")
	}
	remaining := max(0, min(maxOpenNoteSearchUnits, budgetUnits))
	a.contentMu.Lock()
	if a.store == nil || a.sess == nil {
		a.contentMu.Unlock()
		return result, errors.New("open-note search is unavailable before session initialization")
	}
	store := a.store
	documents := make(map[string]session.Document, len(a.sess.Documents))
	for _, document := range a.sess.Documents {
		if document != nil {
			documents[document.ID] = *document
		}
	}
	a.contentMu.Unlock()

	pageRemaining := maxOpenNoteSearchPageUnits
	for index, id := range orderedIDs {
		// Leaving one unit unused avoids a zero-length fragment before an astral rune.
		if index == maxOpenNoteSearchPageIDs || pageRemaining < 2 {
			result.PendingIDs = append(result.PendingIDs, orderedIDs[index:]...)
			return result, nil
		}
		document, exists := documents[id]
		if !exists || isReadOnlyPath(document.Path) {
			result.FailedIDs = append(result.FailedIDs, id)
			continue
		}
		if remaining == 0 {
			result.SkippedIDs = append(result.SkippedIDs, id)
			continue
		}
		var continuation *OpenNoteSearchCursor
		if index == 0 {
			continuation = cursor
		}
		fragment, err := readOpenNoteSearchFragment(store, &document, remaining, pageRemaining, continuation)
		if err != nil {
			result.FailedIDs = append(result.FailedIDs, id)
			continue
		}
		if fragment.oversized {
			result.SkippedIDs = append(result.SkippedIDs, id)
			continue
		}
		result.Notes = append(result.Notes, OpenNoteSearchContent{ID: id, Content: fragment.content, Complete: fragment.complete})
		pageRemaining -= fragment.units
		if !fragment.complete {
			result.NextCursor = fragment.cursor
			result.PendingIDs = append(result.PendingIDs, orderedIDs[index:]...)
			return result, nil
		}
		remaining -= fragment.totalUnits
	}
	return result, nil
}

type openNoteSearchFragment struct {
	content    string
	units      int
	totalUnits int
	complete   bool
	oversized  bool
	cursor     *OpenNoteSearchCursor
}

type openNoteSearchSource struct {
	file      *os.File
	path      string
	info      os.FileInfo
	byteLimit int64
	empty     bool
}

func openSearchSource(store *session.Store, document *session.Document) (openNoteSearchSource, error) {
	// DraftPath normalizes its argument; the API supplies a copied document.
	path := store.DraftPath(document)
	file, err := os.Open(path)
	var byteLimit int64
	if errors.Is(err, os.ErrNotExist) {
		if document.Path == "" {
			return openNoteSearchSource{empty: true}, nil
		}
		path = document.Path
		byteLimit = maxEditableFileSize
		file, err = os.Open(path)
	}
	if err != nil {
		return openNoteSearchSource{}, err
	}
	info, err := file.Stat()
	if err == nil && !info.Mode().IsRegular() {
		err = errors.New("open-note search source is not a regular file")
	}
	if err == nil && byteLimit > 0 && info.Size() > byteLimit {
		err = fmt.Errorf("saved source exceeds its %d-byte editable limit", byteLimit)
	}
	if err != nil {
		file.Close()
		return openNoteSearchSource{}, err
	}
	source := openNoteSearchSource{file: file, path: path, info: info, byteLimit: byteLimit}
	if byteLimit > 0 {
		var prefix [8192]byte
		n, readErr := io.ReadFull(file, prefix[:])
		if readErr != nil && !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
			file.Close()
			return openNoteSearchSource{}, readErr
		}
		source.empty = looksBinary(prefix[:n])
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			file.Close()
			return openNoteSearchSource{}, err
		}
	}
	return source, nil
}

func searchSourceUnchanged(source openNoteSearchSource) bool {
	current, err := source.file.Stat()
	if err != nil || current.Size() != source.info.Size() || !current.ModTime().Equal(source.info.ModTime()) {
		return false
	}
	atPath, err := os.Stat(source.path)
	return err == nil && os.SameFile(current, atPath) && atPath.Size() == source.info.Size() && atPath.ModTime().Equal(source.info.ModTime())
}

func readOpenNoteSearchFragment(store *session.Store, document *session.Document, budgetUnits, pageUnits int, cursor *OpenNoteSearchCursor) (openNoteSearchFragment, error) {
	result := openNoteSearchFragment{}
	source, err := openSearchSource(store, document)
	if err != nil {
		return result, err
	}
	if source.file != nil {
		defer source.file.Close()
	}
	if cursor != nil && (source.file == nil || source.empty || cursor.ID != document.ID || cursor.SourcePath != source.path || cursor.Size != source.info.Size() || cursor.ModTime != strconv.FormatInt(source.info.ModTime().UnixNano(), 10) || cursor.OffsetBytes <= 0 || cursor.OffsetBytes > cursor.Size || cursor.TotalUnits <= 0 || cursor.TotalUnits > budgetUnits || cursor.EmittedUnits <= 0 || cursor.EmittedUnits >= cursor.TotalUnits || cursor.OffsetBytes < int64(cursor.EmittedUnits) || cursor.OffsetBytes > 3*int64(cursor.EmittedUnits)) {
		return result, errors.New("open-note search source or cursor changed during a partial read")
	}
	if source.empty {
		if source.file != nil && !searchSourceUnchanged(source) {
			return result, errors.New("open-note search source changed during its read")
		}
		result.complete = true
		return result, nil
	}
	// Original bytes are an upper bound on UTF-16 units, including invalid UTF-8.
	// Read small complete files once; large files still need whole-note admission.
	if cursor == nil && source.info.Size() <= int64(min(pageUnits, budgetUnits)) {
		data := make([]byte, int(source.info.Size()))
		if _, err := io.ReadFull(source.file, data); err != nil {
			return result, err
		}
		result.content = string(data)
		for _, character := range result.content {
			result.units++
			if character > 0xffff {
				result.units++
			}
		}
		if !searchSourceUnchanged(source) {
			return openNoteSearchFragment{}, errors.New("open-note search source changed during its read")
		}
		result.totalUnits, result.complete = result.units, true
		return result, nil
	}
	if !searchSourceUnchanged(source) {
		return result, errors.New("open-note search source changed before its read")
	}
	var offset int64
	var emitted int
	if cursor == nil {
		byteBudget := int64(budgetUnits) * 3
		if source.info.Size() > byteBudget {
			result.oversized = true
			return result, nil
		}
		result.totalUnits, result.oversized, err = validateSearchText(source.file, budgetUnits, byteBudget, source.byteLimit)
		if err != nil || result.oversized {
			return result, err
		}
	} else {
		offset, emitted, result.totalUnits = cursor.OffsetBytes, cursor.EmittedUnits, cursor.TotalUnits
	}
	if !searchSourceUnchanged(source) {
		return openNoteSearchFragment{}, errors.New("open-note search source changed during validation")
	}
	if _, err := source.file.Seek(offset, io.SeekStart); err != nil {
		return result, err
	}
	remainingBytes := source.info.Size() - offset
	capacity := min(int64(pageUnits), remainingBytes)
	if result.totalUnits-emitted <= pageUnits {
		capacity = min(remainingBytes, 3*int64(pageUnits))
	}
	content, units, err := readSearchTextFragment(source.file, pageUnits, int(capacity))
	if err != nil {
		return result, err
	}
	if !searchSourceUnchanged(source) {
		return openNoteSearchFragment{}, errors.New("open-note search source changed during its read")
	}
	nextOffset := offset + int64(len(content))
	result.complete = nextOffset == source.info.Size()
	if nextOffset > source.info.Size() || emitted+units > result.totalUnits || (result.complete && emitted+units != result.totalUnits) || (!result.complete && (len(content) == 0 || emitted+units >= result.totalUnits)) {
		return openNoteSearchFragment{}, errors.New("open-note search cursor did not produce a consistent fragment")
	}
	result.content, result.units = content, units
	if !result.complete {
		result.cursor = &OpenNoteSearchCursor{
			ID: document.ID, OffsetBytes: nextOffset, SourcePath: source.path,
			Size: source.info.Size(), ModTime: strconv.FormatInt(source.info.ModTime().UnixNano(), 10),
			TotalUnits: result.totalUnits, EmittedUnits: emitted + units,
		}
	}
	return result, nil
}

// A UTF-16 unit occupies at most three original UTF-8 bytes. Invalid UTF-8
// bytes each become one replacement character when Go encodes the bridge JSON.
func validateSearchText(reader io.Reader, budgetUnits int, byteBudget, sourceByteLimit int64) (int, bool, error) {
	var buffer [32*1024 + utf8.UTFMax]byte
	carry, units := 0, 0
	var readBytes int64
	for {
		n, err := reader.Read(buffer[carry:])
		readBytes += int64(n)
		if sourceByteLimit > 0 && readBytes > sourceByteLimit {
			return units, false, fmt.Errorf("saved source exceeds its %d-byte editable limit", sourceByteLimit)
		}
		if readBytes > byteBudget {
			return units, true, nil
		}
		if err != nil && !errors.Is(err, io.EOF) {
			return units, false, err
		}
		end, position := carry+n, 0
		for position < end {
			if !utf8.FullRune(buffer[position:end]) && !errors.Is(err, io.EOF) {
				break
			}
			character, width := utf8.DecodeRune(buffer[position:end])
			units++
			if character > 0xffff {
				units++
			}
			if units > budgetUnits {
				return units, true, nil
			}
			position += width
		}
		carry = copy(buffer[:], buffer[position:end])
		if errors.Is(err, io.EOF) {
			return units, false, nil
		}
	}
}

// Fragments preserve original bytes and stop only at a complete rune boundary.
// Invalid bytes remain individual replacement units across bridge JSON pages.
func readSearchTextFragment(reader io.Reader, budgetUnits, capacity int) (string, int, error) {
	var buffer [32*1024 + utf8.UTFMax]byte
	var content strings.Builder
	content.Grow(max(0, min(capacity, 3*budgetUnits)))
	carry, units := 0, 0
	for {
		n, err := reader.Read(buffer[carry:])
		if err != nil && !errors.Is(err, io.EOF) {
			return "", 0, err
		}
		end, position := carry+n, 0
		for position < end {
			if !utf8.FullRune(buffer[position:end]) && !errors.Is(err, io.EOF) {
				break
			}
			character, width := utf8.DecodeRune(buffer[position:end])
			characterUnits := 1
			if character > 0xffff {
				characterUnits++
			}
			if units+characterUnits > budgetUnits {
				content.Write(buffer[:position])
				return content.String(), units, nil
			}
			units += characterUnits
			position += width
			if units == budgetUnits {
				content.Write(buffer[:position])
				return content.String(), units, nil
			}
		}
		content.Write(buffer[:position])
		carry = copy(buffer[:], buffer[position:end])
		if errors.Is(err, io.EOF) {
			return content.String(), units, nil
		}
	}
}
