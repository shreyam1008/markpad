import { describe, expect, test } from "bun:test";

import {
  MAX_CONTENT_QUERY_LENGTH,
  searchNoteContent,
  searchOpenNotes,
} from "../src/workspace/content-search";

describe("note content search", () => {
  test("finds literal case-insensitive text and returns source selections", () => {
    const content = "Release [v1.2] ready.\nRELEASE [V1.2] checked.";
    const result = searchNoteContent(content, "[v1.2]");
    expect(result.matches.map(({ start, end, text }) => ({ start, end, text }))).toEqual([
      { start: 8, end: 14, text: "[v1.2]" },
      { start: 30, end: 36, text: "[V1.2]" },
    ]);
    expect(result.truncated).toBe(false);
    for (const match of result.matches) {
      expect(content.slice(match.start, match.end)).toBe(match.text);
      expect(match.snippet.slice(match.highlightStart, match.highlightEnd)).toBe(match.text);
    }
  });

  test("preserves UTF-16 offsets through Unicode case folding, emoji and CRLF", () => {
    const content = "İstanbul 🔎\r\nCAFÉ 𐐀 note\rnext note";
    const accented = searchNoteContent(content, "café").matches[0];
    expect(accented).toMatchObject({ start: 13, end: 17, line: 2, column: 1, text: "CAFÉ" });
    const astral = searchNoteContent(content, "𐐨").matches[0];
    expect(astral).toMatchObject({ start: 18, end: 20, line: 2, column: 6, text: "𐐀" });
    expect(
      searchNoteContent(content, "note").matches.map(({ line, column }) => ({ line, column })),
    ).toEqual([
      { line: 2, column: 9 },
      { line: 3, column: 6 },
    ]);
  });

  test("searches multiline literals and provides a short stable snippet", () => {
    const content = `${"prefix ".repeat(50)}alpha\r\nbeta${" suffix".repeat(50)}`;
    const match = searchNoteContent(content, "alpha\r\nbeta").matches[0];
    expect(match.text).toBe("alpha\r\nbeta");
    expect(match.snippet.length).toBeLessThanOrEqual(163);
    expect(match.snippet.slice(match.highlightStart, match.highlightEnd)).toBe("alpha  beta");
    expect(match.snippet.startsWith("…")).toBe(true);
    expect(match.snippet.endsWith("…")).toBe(true);
  });

  test("finds matches crossing scan windows once, with correct locations", () => {
    const prefix = `${"line\r\n".repeat(5_460)}xxx`;
    const content = `${prefix}cross-window\n𐐀cross-window`;
    const matches = searchNoteContent(content, "cross-window").matches;
    expect(matches.map(({ start, line, column }) => ({ start, line, column }))).toEqual([
      { start: prefix.length, line: 5_461, column: 4 },
      { start: prefix.length + 15, line: 5_462, column: 3 },
    ]);
    expect(searchNoteContent(`${"x".repeat(32_767)}𐐀`, "𐐨").matches[0]).toMatchObject({
      start: 32_767,
      end: 32_769,
    });
  });

  test("uses non-overlapping selections and reports only real result overflow", () => {
    expect(searchNoteContent("aaaa", "aa").matches.map(({ start }) => start)).toEqual([0, 2]);
    expect(searchNoteContent("match match", "match", { limit: 2 }).truncated).toBe(false);
    const capped = searchNoteContent("match match match", "match", { limit: 2 });
    expect(capped.matches).toHaveLength(2);
    expect(capped.truncated).toBe(true);
    expect(searchNoteContent("x ".repeat(1_000), "x", { limit: 10_000 }).matches).toHaveLength(500);
    expect(searchNoteContent("", "query").matches).toEqual([]);
    expect(searchNoteContent("space", "  ").matches).toEqual([]);
    expect(
      searchNoteContent("large query", "x".repeat(MAX_CONTENT_QUERY_LENGTH + 1)).queryTooLong,
    ).toBe(true);
  });

  test.each(["meating", "meting", "meeeting", "meetign"])(
    "optionally tolerates one typo in %s and marks the source word",
    (query) => {
      expect(searchNoteContent("meeting", query).matches).toEqual([]);
      expect(searchNoteContent("meeting", query, { fuzzy: true }).matches[0]).toMatchObject({
        start: 0,
        end: 7,
        text: "meeting",
        fuzzy: true,
      });
    },
  );

  test("puts exact hits before near matches without duplicating exact substrings", () => {
    const result = searchNoteContent("plann planning plan PLAN", "plan", { fuzzy: true });
    expect(result.matches.map(({ text, fuzzy }) => ({ text, fuzzy }))).toEqual([
      { text: "plan", fuzzy: false },
      { text: "plan", fuzzy: false },
      { text: "plan", fuzzy: false },
      { text: "PLAN", fuzzy: false },
    ]);
    const mixed = searchNoteContent("plam plan", "plan", { fuzzy: true });
    expect(mixed.matches.map(({ text, fuzzy }) => ({ text, fuzzy }))).toEqual([
      { text: "plan", fuzzy: false },
      { text: "plam", fuzzy: true },
    ]);
    expect(searchNoteContent("plam plan", "plan", { fuzzy: true, limit: 1 }).truncated).toBe(true);
  });

  test("keeps typo tolerance light and respects Unicode word boundaries", () => {
    expect(searchNoteContent("xxmeatingxx meetingz", "meting", { fuzzy: true }).matches).toEqual(
      [],
    );
    expect(searchNoteContent("caft", "cat", { fuzzy: true }).matches).toEqual([]);
    expect(searchNoteContent("two worts", "two words", { fuzzy: true }).matches).toEqual([]);
    expect(searchNoteContent("cafè", "café", { fuzzy: true }).matches[0]).toMatchObject({
      text: "cafè",
      fuzzy: true,
    });
    const content = `${" ".repeat(32_766)}meetign next`;
    expect(searchNoteContent(content, "meeting", { fuzzy: true }).matches).toHaveLength(1);
    expect(
      searchNoteContent(`${"a".repeat(32_768)}meetign`, "meeting", { fuzzy: true }).matches,
    ).toEqual([]);
  });

  test("returns cancellation explicitly for an already aborted request", () => {
    const controller = new AbortController();
    controller.abort();
    expect(searchNoteContent("meeting", "meeting", { signal: controller.signal })).toMatchObject({
      matches: [],
      cancelled: true,
      truncated: false,
    });
  });
});

describe("all open notes search", () => {
  test("searches the supplied live buffers, including drafts, and prioritizes exact hits globally", async () => {
    const notes = [
      { id: "draft", title: "Untitled", content: "meetign in unsaved draft" },
      { id: "saved", title: "Notes.md", content: "meeting in current unsaved edits" },
    ];
    const result = await searchOpenNotes(notes, "meeting", { fuzzy: true });
    expect(
      result.matches.map(({ noteId, noteTitle, text, fuzzy }) => ({
        noteId,
        noteTitle,
        text,
        fuzzy,
      })),
    ).toEqual([
      { noteId: "saved", noteTitle: "Notes.md", text: "meeting", fuzzy: false },
      { noteId: "draft", noteTitle: "Untitled", text: "meetign", fuzzy: true },
    ]);
    expect(result.cancelled).toBe(false);
    expect(notes[0].content).toBe("meetign in unsaved draft");
  });

  test("caps the combined result set and preserves exact matches ahead of early typos", async () => {
    const result = await searchOpenNotes(
      [
        { id: "early", title: "Early", content: "meetign meetign" },
        { id: "later", title: "Later", content: "meeting meeting" },
      ],
      "meeting",
      { fuzzy: true, limit: 2 },
    );
    expect(result.matches.map(({ noteId }) => noteId)).toEqual(["later", "later"]);
    expect(result.truncated).toBe(true);
  });

  test("yields during a large unsuccessful search so a newer request can cancel it", async () => {
    const controller = new AbortController();
    const pending = searchOpenNotes(
      Array.from({ length: 32 }, (_, index) => ({
        id: String(index),
        title: "Large buffer",
        content: "ordinary writing\n".repeat(120_000),
      })),
      "unmatched",
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 0);
    const result = await pending;
    expect(result.cancelled).toBe(true);
    expect(result.matches).toEqual([]);
  });

  test("handles empty scope and aborted requests", async () => {
    expect((await searchOpenNotes([], "note")).matches).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    expect(
      await searchOpenNotes([{ id: "a", title: "A", content: "note" }], "note", {
        signal: controller.signal,
      }),
    ).toMatchObject({
      matches: [],
      cancelled: true,
    });
  });
});
