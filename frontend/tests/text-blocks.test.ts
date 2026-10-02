import { describe, expect, test } from "bun:test";

import {
  countText,
  editorOffsetForSource,
  exceedsHighlightLimit,
  findText,
  sourceOffsetForEditor,
  textBlocks,
} from "../src/preview/text-blocks";
import { outlineFromMarkdown } from "../src/workspace/documents";

describe("large text processing", () => {
  test("keeps the exact syntax limits, including trailing newlines", () => {
    expect(exceedsHighlightLimit("x".repeat(200_000))).toBe(false);
    expect(exceedsHighlightLimit("x".repeat(200_001))).toBe(true);
    expect(exceedsHighlightLimit("\n".repeat(1_999))).toBe(false);
    expect(exceedsHighlightLimit("\n".repeat(2_000))).toBe(true);
  });
  test("search counts a million occurrences and preserves wraparound without a match array", () => {
    const text = "x ".repeat(1_000_000);
    expect(findText(text, "X", 1)).toEqual({ count: 1_000_000, index: 1, position: 2 });
    expect(findText(text, "x", text.length)).toEqual({ count: 1_000_000, index: 0, position: 0 });
    expect(findText(text, "missing", 0)).toEqual({ count: 0, index: 0, position: -1 });
  });
  test("find searches literal punctuation and preserves source offsets after Unicode case folding", () => {
    expect(findText("İ prefix 😀 [note]", "[NOTE]", 0)).toEqual({
      count: 1,
      index: 0,
      position: 12,
    });
    expect(findText("a.b a?b", "a.b", 0)).toEqual({ count: 1, index: 0, position: 0 });
  });
  test("previous find moves backwards and wraps to the last match", () => {
    expect(findText("note note note", "NOTE", 5, -1)).toEqual({ count: 3, index: 0, position: 0 });
    expect(findText("note note note", "note", 0, -1)).toEqual({ count: 3, index: 2, position: 10 });
  });
  test("maps CRLF source selections to editor positions without rewriting the source", () => {
    const source = "first\r\nsecond\r\n😀 note\r\nlast";
    const normalized = source.replace(/\r\n/g, "\n");
    const start = source.indexOf("note");
    const editorStart = editorOffsetForSource(source, start);
    const editorEnd = editorOffsetForSource(source, start + 4);
    expect(normalized.slice(editorStart, editorEnd)).toBe("note");
    expect(sourceOffsetForEditor(source, editorStart)).toBe(start);
    expect(sourceOffsetForEditor(source, editorEnd)).toBe(start + 4);
    expect(editorOffsetForSource(source, source.length)).toBe(normalized.length);
    expect(sourceOffsetForEditor(source, normalized.length)).toBe(source.length);
  });
  test("retains every byte and newline across blocks", () => {
    for (const text of ["", "a\r\nb\n", "x".repeat(100000), "a😀\r\n".repeat(100000)]) {
      const blocks = textBlocks(text);
      expect(blocks.join("")).toBe(text);
      expect(blocks.slice(0, -1).every((block) => block.endsWith("\n"))).toBe(true);
    }
  });
  test("counts words and lines without retaining split arrays", () => {
    for (const text of [
      "",
      " ",
      "a b\n",
      "a\r\nb",
      "a\u00a0b\u2028c",
      "😀\tword\ufefflast",
      "line with words\n".repeat(100000),
    ]) {
      expect(countText(text)).toEqual({
        lines: text ? text.split("\n").length : 0,
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
      });
    }
  });
  test("keeps exact heading line positions in large notes", () => {
    const content = `${"prose\n".repeat(40000)}## End ##\r\nplain\n# Last`;
    expect(outlineFromMarkdown(content)).toEqual([
      { level: 2, text: "End", line: 40000 },
      { level: 1, text: "Last", line: 40002 },
    ]);
  });
});
