import { describe, expect, test } from "bun:test";

import { countText, exceedsHighlightLimit, findText, textBlocks } from "../src/preview/text-blocks";
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
