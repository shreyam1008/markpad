package main

import (
	"bytes"
	"encoding/json"
	"io"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"markpad/internal/session"
)

func addSearchDraft(t *testing.T, app *App, content string) *session.Document {
	t.Helper()
	document := session.NewDocument("", content)
	app.sess.Add(document)
	if err := app.store.WriteDraft(document, content); err != nil {
		t.Fatal(err)
	}
	return document
}

func TestSearchSnapshotUTF16BudgetPreservesSource(t *testing.T) {
	t.Parallel()
	for _, item := range []struct {
		name    string
		content string
		units   int
	}{
		{"ASCII", "abc", 3},
		{"BMP", "界é", 2},
		{"astral", "🧭a", 3},
		{"CRLF", "a\r\nb", 4},
		{"invalid UTF8", string([]byte{0xe7, 0x95, 0x8c, 0xff, 0xf0, 0x9f}), 4},
		{"chunk rune boundary", strings.Repeat("a", 32*1024+2) + "🧭\r\n界", 32*1024 + 7},
	} {
		t.Run(item.name, func(t *testing.T) {
			app, document := switchPersistenceApp(t, item.content, false)
			fragment, readErr := readOpenNoteSearchFragment(app.store, document, item.units, item.units, nil)
			content, units, oversized := fragment.content, fragment.units, fragment.oversized
			if readErr != nil || oversized || content != item.content || units != item.units {
				t.Fatalf("accepted reader result = %d units, oversized %v err %v; want %d", units, oversized, readErr, item.units)
			}
			snapshot, err := app.GetOpenNoteSearchSnapshot([]string{document.ID}, item.units, nil)
			if err != nil || len(snapshot.Notes) != 1 || snapshot.Notes[0].Content != item.content {
				t.Fatalf("source changed or rejected at its exact UTF16 budget: notes=%d err=%v", len(snapshot.Notes), err)
			}
			payload, err := json.Marshal(snapshot)
			if err != nil {
				t.Fatal(err)
			}
			var bridged OpenNoteSearchSnapshot
			if err := json.Unmarshal(payload, &bridged); err != nil {
				t.Fatal(err)
			}
			if units, oversized := searchTextUnits([]byte(bridged.Notes[0].Content), item.units); oversized || units != item.units {
				t.Fatalf("bridge text uses %d UTF16 units, want %d", units, item.units)
			}
			if item.name == "invalid UTF8" && bridged.Notes[0].Content != "界���" {
				t.Fatalf("JSON replacements = %q", bridged.Notes[0].Content)
			}
			fragment, readErr = readOpenNoteSearchFragment(app.store, document, item.units-1, item.units, nil)
			content, units, oversized = fragment.content, fragment.units, fragment.oversized
			if readErr != nil || !oversized || content != "" || units != 0 {
				t.Fatalf("oversized reader returned partial content or units: %d units, oversized %v err %v", units, oversized, readErr)
			}
			snapshot, err = app.GetOpenNoteSearchSnapshot([]string{document.ID}, item.units-1, nil)
			if err != nil || len(snapshot.Notes) != 0 || !reflect.DeepEqual(snapshot.SkippedIDs, []string{document.ID}) {
				t.Fatalf("oversized source crossed the bridge: notes=%d skipped=%v err=%v", len(snapshot.Notes), snapshot.SkippedIDs, err)
			}
		})
	}
}

func TestSearchSnapshotSkipsLargeDraftAndKeepsLaterSmallNotes(t *testing.T) {
	t.Parallel()
	app, large := switchPersistenceApp(t, "", false)
	file, err := os.OpenFile(app.store.DraftPath(large), os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxOpenNoteSearchUnits + 1); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	small := addSearchDraft(t, app, "later target")
	snapshot, err := app.GetOpenNoteSearchSnapshot([]string{large.ID, small.ID}, math.MaxInt, nil)
	if err != nil || !reflect.DeepEqual(snapshot.SkippedIDs, []string{large.ID}) {
		t.Fatalf("large draft = skipped %v, err %v", snapshot.SkippedIDs, err)
	}
	if !reflect.DeepEqual(snapshot.Notes, []OpenNoteSearchContent{{ID: small.ID, Content: "later target", Complete: true}}) {
		t.Fatalf("small note after oversized draft was lost: %#v", snapshot.Notes)
	}
	if err := os.Truncate(app.store.DraftPath(large), 3*maxOpenNoteSearchUnits+1); err != nil {
		t.Fatal(err)
	}
	snapshot, err = app.GetOpenNoteSearchSnapshot([]string{large.ID, small.ID}, maxOpenNoteSearchUnits, nil)
	if err != nil || len(snapshot.Notes) != 1 || snapshot.Notes[0].ID != small.ID || len(snapshot.SkippedIDs) != 1 {
		t.Fatalf("stat-rejected draft blocked later notes: notes=%d skipped=%v err=%v", len(snapshot.Notes), snapshot.SkippedIDs, err)
	}
}

func TestSearchSnapshotUsesDirtyRecoveryWithoutWriting(t *testing.T) {
	t.Parallel()
	app, document := switchPersistenceApp(t, "saved source", true)
	if err := app.UpdateContent(document.ID, "dirty recovery wins", true); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(document.Path, []byte("externally changed source"), 0o600); err != nil {
		t.Fatal(err)
	}
	before := *document
	draftStamp := stampPersistenceFile(t, app.store.DraftPath(document))
	sourceStamp := stampPersistenceFile(t, document.Path)
	snapshot, err := app.GetOpenNoteSearchSnapshot([]string{document.ID}, 100, nil)
	if err != nil || len(snapshot.Notes) != 1 || snapshot.Notes[0].Content != "dirty recovery wins" {
		t.Fatalf("dirty recovery = %#v, %v", snapshot.Notes, err)
	}
	assertPersistenceFileUnchanged(t, app.store.DraftPath(document), draftStamp)
	assertPersistenceFileUnchanged(t, document.Path, sourceStamp)
	if !reflect.DeepEqual(*document, before) {
		t.Fatal("search mutated document metadata or the source baseline")
	}
}

func TestSearchSnapshotMissingDraftFallbackNeverRepairs(t *testing.T) {
	t.Parallel()
	for _, source := range []string{"saved\r\nsource", "binary\x00source"} {
		app, document := switchPersistenceApp(t, source, true)
		draftPath := app.store.DraftPath(document)
		if err := os.Remove(draftPath); err != nil {
			t.Fatal(err)
		}
		before := *document
		sourceStamp := stampPersistenceFile(t, document.Path)
		snapshot, err := app.GetOpenNoteSearchSnapshot([]string{document.ID}, 100, nil)
		want := source
		if strings.ContainsRune(source, 0) {
			want = ""
		}
		if err != nil || len(snapshot.Notes) != 1 || snapshot.Notes[0].Content != want {
			t.Fatalf("fallback = %#v, %v", snapshot.Notes, err)
		}
		if _, err := os.Stat(draftPath); !os.IsNotExist(err) {
			t.Fatalf("search repaired a missing draft: %v", err)
		}
		assertPersistenceFileUnchanged(t, document.Path, sourceStamp)
		if !reflect.DeepEqual(*document, before) {
			t.Fatal("fallback search changed document metadata or source baseline")
		}
	}
}

func TestSearchSnapshotReportsFailuresWithoutSourceFallbackOnDraftErrors(t *testing.T) {
	t.Parallel()
	app, document := switchPersistenceApp(t, "saved fallback must not replace unreadable recovery", true)
	draftPath := app.store.DraftPath(document)
	if err := os.Remove(draftPath); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(draftPath, 0o700); err != nil {
		t.Fatal(err)
	}
	sourceStamp := stampPersistenceFile(t, document.Path)
	snapshot, err := app.GetOpenNoteSearchSnapshot([]string{document.ID}, 100, nil)
	if err != nil || len(snapshot.Notes) != 0 || !reflect.DeepEqual(snapshot.FailedIDs, []string{document.ID}) {
		t.Fatalf("unreadable draft = notes %d failed %v err %v", len(snapshot.Notes), snapshot.FailedIDs, err)
	}
	assertPersistenceFileUnchanged(t, document.Path, sourceStamp)
	if err := os.Remove(draftPath); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(document.Path, maxEditableFileSize+1); err != nil {
		t.Fatal(err)
	}
	snapshot, err = app.GetOpenNoteSearchSnapshot([]string{document.ID}, maxOpenNoteSearchUnits, nil)
	if err != nil || len(snapshot.FailedIDs) != 1 || len(snapshot.Notes) != 0 {
		t.Fatalf("oversized saved source = notes %d failed %v err %v", len(snapshot.Notes), snapshot.FailedIDs, err)
	}
	if err := os.Remove(document.Path); err != nil {
		t.Fatal(err)
	}
	snapshot, err = app.GetOpenNoteSearchSnapshot([]string{document.ID}, 100, nil)
	if err != nil || len(snapshot.FailedIDs) != 1 || len(snapshot.Notes) != 0 {
		t.Fatalf("missing saved source = notes %d failed %v err %v", len(snapshot.Notes), snapshot.FailedIDs, err)
	}
}

func TestSearchSnapshotSharesBudgetUsingUTF16Units(t *testing.T) {
	t.Parallel()
	app, first := switchPersistenceApp(t, "界", false)
	second := addSearchDraft(t, app, "🧭")
	ids := []string{first.ID, second.ID}
	snapshot, err := app.GetOpenNoteSearchSnapshot(ids, 3, nil)
	if err != nil || len(snapshot.Notes) != 2 || len(snapshot.SkippedIDs) != 0 {
		t.Fatalf("three aggregate UTF16 units = notes %d skipped %v err %v", len(snapshot.Notes), snapshot.SkippedIDs, err)
	}
	snapshot, err = app.GetOpenNoteSearchSnapshot(ids, 2, nil)
	if err != nil || len(snapshot.Notes) != 1 || snapshot.Notes[0].ID != first.ID || !reflect.DeepEqual(snapshot.SkippedIDs, []string{second.ID}) {
		t.Fatalf("two aggregate UTF16 units = notes %d skipped %v err %v", len(snapshot.Notes), snapshot.SkippedIDs, err)
	}
}

func TestSearchSnapshotPreservesOrderDeduplicatesAndClampsBudgets(t *testing.T) {
	t.Parallel()
	app, first := switchPersistenceApp(t, "first", false)
	second := addSearchDraft(t, app, "second")
	readonly := addSearchDraft(t, app, "must not search this")
	readonly.Path = filepath.Join(t.TempDir(), "readonly.pdf")
	ids := []string{second.ID, first.ID, second.ID, "closed", readonly.ID, "closed"}
	snapshot, err := app.GetOpenNoteSearchSnapshot(ids, 100, nil)
	if err != nil || !reflect.DeepEqual(snapshot.Notes, []OpenNoteSearchContent{{second.ID, "second", true}, {first.ID, "first", true}}) {
		t.Fatalf("ordered deduplicated notes = %#v, %v", snapshot.Notes, err)
	}
	if !reflect.DeepEqual(snapshot.FailedIDs, []string{"closed", readonly.ID}) {
		t.Fatalf("invalid IDs = %v", snapshot.FailedIDs)
	}
	for _, budget := range []int{0, -1, math.MinInt} {
		snapshot, err = app.GetOpenNoteSearchSnapshot(ids, budget, nil)
		if err != nil || len(snapshot.Notes) != 0 || !reflect.DeepEqual(snapshot.SkippedIDs, []string{second.ID, first.ID}) {
			t.Fatalf("budget %d = notes %d skipped %v err %v", budget, len(snapshot.Notes), snapshot.SkippedIDs, err)
		}
	}
	// DraftPath normalization is private to the search's copied metadata.
	first.DraftFile = ""
	before := *first
	if _, err := app.GetOpenNoteSearchSnapshot([]string{first.ID}, 100, nil); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(*first, before) {
		t.Fatal("search normalized the live session document")
	}
}

func TestSearchSnapshotArraysAreNeverNull(t *testing.T) {
	t.Parallel()
	app, _ := switchPersistenceApp(t, "", false)
	uninitialized := &App{}
	for _, target := range []*App{app, uninitialized} {
		snapshot, err := target.GetOpenNoteSearchSnapshot(nil, maxOpenNoteSearchUnits, nil)
		if target == app && err != nil {
			t.Fatal(err)
		}
		if target != app && err == nil {
			t.Fatal("uninitialized search should return a descriptive error")
		}
		data, marshalErr := json.Marshal(snapshot)
		if marshalErr != nil || string(data) != `{"notes":[],"skippedIds":[],"failedIds":[],"pendingIds":[],"nextCursor":null}` {
			t.Fatalf("empty snapshot = %s, %v", data, marshalErr)
		}
	}
}

type bytewiseSearchReader struct{ io.Reader }

func (reader bytewiseSearchReader) Read(data []byte) (int, error) {
	return reader.Reader.Read(data[:min(1, len(data))])
}

func TestSearchTextValidationHandlesFragmentedUTF8AndInvalidEOF(t *testing.T) {
	t.Parallel()
	data := append([]byte("a🧭\r\n界"), 0xf0, 0x9f)
	units, _ := searchTextUnits(data, 100)
	for _, budget := range []int{units, units - 1} {
		validatedUnits, oversized, err := validateSearchText(bytewiseSearchReader{bytes.NewReader(data)}, budget, int64(len(data)), 0)
		if err != nil || oversized != (budget < units) {
			t.Fatalf("fragmented validation at %d units = oversized %v err %v", budget, oversized, err)
		}
		if !oversized && validatedUnits != units {
			t.Fatalf("fragmented validation returned %d units, want %d", validatedUnits, units)
		}
	}
}

func searchTextUnits(data []byte, limit int) (units int, oversized bool) {
	for _, character := range string(data) {
		units++
		if character > 0xffff {
			units++
		}
		if units > limit {
			return units, true
		}
	}
	return units, false
}

func TestSearchSnapshotPagesLargeNotesWithoutSplittingRunes(t *testing.T) {
	t.Parallel()
	content := strings.Repeat("a", maxOpenNoteSearchPageUnits-1) + "🧭\r\n界" + string([]byte{0xff, 0xf0, 0x9f}) + strings.Repeat("\x01", maxOpenNoteSearchPageUnits)
	app, document := switchPersistenceApp(t, content, false)
	wantUnits, _ := searchTextUnits([]byte(content), maxOpenNoteSearchUnits)
	later := addSearchDraft(t, app, "later")
	ids := []string{document.ID, later.ID}
	budget := wantUnits
	var cursor *OpenNoteSearchCursor
	var pieces []string
	var bridgedPieces []string
	pages := 0
	for len(ids) > 0 {
		snapshot, err := app.GetOpenNoteSearchSnapshot(ids, budget, cursor)
		if err != nil {
			t.Fatal(err)
		}
		pages++
		if pages > 10 {
			t.Fatal("pagination did not make progress")
		}
		pageUnits := 0
		for _, note := range snapshot.Notes {
			units, _ := searchTextUnits([]byte(note.Content), maxOpenNoteSearchUnits)
			pageUnits += units
			if note.ID != document.ID {
				t.Fatal("later note crossed the already-admitted whole-note budget")
			}
			pieces = append(pieces, note.Content)
			payload, err := json.Marshal(note)
			if err != nil {
				t.Fatal(err)
			}
			// Six escaped bytes per unit still bound the native bridge packet.
			if len(payload) > 6*maxOpenNoteSearchPageUnits+256 {
				t.Fatalf("escaped fragment payload is unbounded: %d", len(payload))
			}
			var bridged OpenNoteSearchContent
			if err := json.Unmarshal(payload, &bridged); err != nil {
				t.Fatal(err)
			}
			bridgedPieces = append(bridgedPieces, bridged.Content)
			if note.Complete {
				budget -= wantUnits
			}
		}
		if pageUnits > maxOpenNoteSearchPageUnits {
			t.Fatalf("page uses %d units", pageUnits)
		}
		if snapshot.NextCursor != nil {
			if snapshot.NextCursor.TotalUnits != wantUnits || snapshot.NextCursor.EmittedUnits <= 0 || (cursor != nil && snapshot.NextCursor.OffsetBytes <= cursor.OffsetBytes) {
				t.Fatalf("invalid continuation: %#v", snapshot.NextCursor)
			}
			if len(snapshot.PendingIDs) == 0 || snapshot.PendingIDs[0] != document.ID || snapshot.Notes[len(snapshot.Notes)-1].Complete {
				t.Fatal("unfinished note did not terminate its page")
			}
		}
		ids, cursor = snapshot.PendingIDs, snapshot.NextCursor
	}
	if pages < 3 || strings.Join(pieces, "") != content {
		t.Fatalf("fragmented source changed: %d pages", pages)
	}
	wantBridged := strings.ToValidUTF8(content, "�")
	// ToValidUTF8 coalesces invalid runs; bridge JSON replaces each invalid byte.
	wantBridged = strings.Replace(wantBridged, "�", "���", 1)
	if strings.Join(bridgedPieces, "") != wantBridged {
		t.Fatal("bridge fragments split a rune or changed invalid-byte replacements")
	}
}

func TestSearchSnapshotPagesAtMost128IDs(t *testing.T) {
	t.Parallel()
	app, first := switchPersistenceApp(t, "", false)
	ids := []string{first.ID}
	for len(ids) < maxOpenNoteSearchPageIDs+5 {
		ids = append(ids, addSearchDraft(t, app, "").ID)
	}
	snapshot, err := app.GetOpenNoteSearchSnapshot(ids, 100, nil)
	if err != nil || len(snapshot.Notes) != maxOpenNoteSearchPageIDs || len(snapshot.PendingIDs) != 5 || snapshot.NextCursor != nil {
		t.Fatalf("ID-limited page = notes %d pending %d err %v", len(snapshot.Notes), len(snapshot.PendingIDs), err)
	}
	if !reflect.DeepEqual(snapshot.PendingIDs, ids[maxOpenNoteSearchPageIDs:]) {
		t.Fatal("pending IDs changed order")
	}
	last, err := app.GetOpenNoteSearchSnapshot(snapshot.PendingIDs, 100, nil)
	if err != nil || len(last.Notes) != 5 || len(last.PendingIDs) != 0 {
		t.Fatalf("final ID page = notes %d pending %d err %v", len(last.Notes), len(last.PendingIDs), err)
	}
}

func TestSearchSnapshotLeavesTinyPageResidualForNextPage(t *testing.T) {
	t.Parallel()
	app, first := switchPersistenceApp(t, strings.Repeat("a", maxOpenNoteSearchPageUnits-1), false)
	astral := addSearchDraft(t, app, "🧭")
	snapshot, err := app.GetOpenNoteSearchSnapshot([]string{first.ID, astral.ID}, maxOpenNoteSearchUnits, nil)
	if err != nil || len(snapshot.Notes) != 1 || !snapshot.Notes[0].Complete || !reflect.DeepEqual(snapshot.PendingIDs, []string{astral.ID}) || snapshot.NextCursor != nil {
		t.Fatalf("one-unit residual = notes %d pending %v err %v", len(snapshot.Notes), snapshot.PendingIDs, err)
	}
	next, err := app.GetOpenNoteSearchSnapshot(snapshot.PendingIDs, 2, nil)
	if err != nil || len(next.Notes) != 1 || next.Notes[0].Content != "🧭" || !next.Notes[0].Complete || len(next.PendingIDs) != 0 {
		t.Fatalf("astral next page = %#v, %v", next, err)
	}
}

func TestSearchSnapshotRejectsChangedPartialSourceWithoutChargingBudget(t *testing.T) {
	t.Parallel()
	for _, change := range []string{"size", "modtime", "source identity"} {
		t.Run(change, func(t *testing.T) {
			app, document := switchPersistenceApp(t, strings.Repeat("x", maxOpenNoteSearchPageUnits+5), true)
			later := addSearchDraft(t, app, "later small note")
			ids := []string{document.ID, later.ID}
			first, err := app.GetOpenNoteSearchSnapshot(ids, maxOpenNoteSearchUnits, nil)
			if err != nil || first.NextCursor == nil || len(first.Notes) != 1 || first.Notes[0].Complete {
				t.Fatalf("first partial page = %#v, %v", first, err)
			}
			draft := app.store.DraftPath(document)
			switch change {
			case "size":
				if err := os.Truncate(draft, maxOpenNoteSearchPageUnits+6); err != nil {
					t.Fatal(err)
				}
			case "modtime":
				stamp := time.Now().Add(2 * time.Hour)
				if err := os.Chtimes(draft, stamp, stamp); err != nil {
					t.Fatal(err)
				}
			case "source identity":
				if err := os.Remove(draft); err != nil {
					t.Fatal(err)
				}
			}
			next, err := app.GetOpenNoteSearchSnapshot(first.PendingIDs, maxOpenNoteSearchUnits, first.NextCursor)
			if err != nil || !reflect.DeepEqual(next.FailedIDs, []string{document.ID}) || !reflect.DeepEqual(next.Notes, []OpenNoteSearchContent{{later.ID, "later small note", true}}) || len(next.PendingIDs) != 0 || next.NextCursor != nil {
				t.Fatalf("changed source did not discard partial and retain later note: %#v, %v", next, err)
			}
		})
	}
}

func TestSearchSnapshotRejectsInvalidCursors(t *testing.T) {
	t.Parallel()
	app, document := switchPersistenceApp(t, strings.Repeat("a", maxOpenNoteSearchPageUnits+8), false)
	first, err := app.GetOpenNoteSearchSnapshot([]string{document.ID}, maxOpenNoteSearchUnits, nil)
	if err != nil || first.NextCursor == nil {
		t.Fatalf("first partial = %#v, %v", first, err)
	}
	for _, mutate := range []func(*OpenNoteSearchCursor){
		func(c *OpenNoteSearchCursor) { c.OffsetBytes = 0 },
		func(c *OpenNoteSearchCursor) { c.OffsetBytes = c.Size + 1 },
		func(c *OpenNoteSearchCursor) { c.EmittedUnits = 0 },
		func(c *OpenNoteSearchCursor) { c.EmittedUnits = c.TotalUnits },
		func(c *OpenNoteSearchCursor) { c.TotalUnits = maxOpenNoteSearchUnits + 1 },
		func(c *OpenNoteSearchCursor) { c.ModTime = "rounded timestamp" },
	} {
		cursor := *first.NextCursor
		mutate(&cursor)
		next, err := app.GetOpenNoteSearchSnapshot(first.PendingIDs, maxOpenNoteSearchUnits, &cursor)
		if err != nil || len(next.Notes) != 0 || !reflect.DeepEqual(next.FailedIDs, []string{document.ID}) || len(next.PendingIDs) != 0 {
			t.Fatalf("invalid cursor did not terminate: %#v, %v", next, err)
		}
	}
	bad := *first.NextCursor
	bad.ID = "not first"
	if _, err := app.GetOpenNoteSearchSnapshot(first.PendingIDs, maxOpenNoteSearchUnits, &bad); err == nil {
		t.Fatal("cursor for an unrelated ID was accepted")
	}
}

func TestSearchTextFragmentHandlesFragmentedRunesAndInvalidEOF(t *testing.T) {
	t.Parallel()
	for _, content := range []string{"a🧭\r\n界", string([]byte{0xff, 0xf0, 0x9f}), strings.Repeat("a", 32*1024+2) + "🧭"} {
		units, _ := searchTextUnits([]byte(content), maxOpenNoteSearchUnits)
		for _, budget := range []int{units, units - 1} {
			fragment, gotUnits, err := readSearchTextFragment(bytewiseSearchReader{strings.NewReader(content)}, budget, min(budget, len(content)))
			if err != nil || gotUnits > budget {
				t.Fatalf("fragment budget %d = units %d err %v", budget, gotUnits, err)
			}
			if budget == units && string(fragment) != content {
				t.Fatal("fragmented reader changed original bytes")
			}
			if utf8.ValidString(content) && !utf8.ValidString(fragment) {
				t.Fatal("valid rune was split across fragments")
			}
		}
	}
}

func TestSearchSnapshotSmallFileFastPathCountsOriginalUnits(t *testing.T) {
	t.Parallel()
	for _, content := range []string{"界é", "🧭\r\n", "B界" + string([]byte{0xff, 0xf0, 0x9f})} {
		app, document := switchPersistenceApp(t, content, false)
		units, _ := searchTextUnits([]byte(content), maxOpenNoteSearchUnits)
		budget := len(content)
		fragment, err := readOpenNoteSearchFragment(app.store, document, budget, maxOpenNoteSearchPageUnits, nil)
		if err != nil || !fragment.complete || fragment.content != content || fragment.units != units || fragment.totalUnits != units || fragment.cursor != nil {
			t.Fatalf("small complete source = %#v, %v; want %d units", fragment, err, units)
		}
		laterContent := strings.Repeat("s", budget-units)
		later := addSearchDraft(t, app, laterContent)
		snapshot, err := app.GetOpenNoteSearchSnapshot([]string{document.ID, later.ID}, budget, nil)
		if err != nil || !reflect.DeepEqual(snapshot.Notes, []OpenNoteSearchContent{{document.ID, content, true}, {later.ID, laterContent, true}}) || len(snapshot.PendingIDs) != 0 || len(snapshot.SkippedIDs) != 0 {
			t.Fatalf("small-file byte size was charged instead of UTF16 units: %#v, %v", snapshot, err)
		}
	}
}
