import { describe, expect, test } from "bun:test";

import { fuzzyMatch, rankPaletteFiles } from "../src/commands";
import type { NoteInfo } from "../src/workspace/types";

const openNote: NoteInfo = {
  id: "open",
  title: "Project Plan.md",
  path: "/notes/project-plan.md",
  dirty: false,
  star: false,
  kind: "markdown",
  viewMode: "",
  size: 42,
  scrollTop: 0,
  viewTop: 0,
  cursor: 0,
};

describe("palette file ranking", () => {
  test("fuzzy matching rewards compact path-boundary matches", () => {
    expect(fuzzyMatch("pp", "Project Plan")!.score).toBeGreaterThan(
      fuzzyMatch("pp", "project-long-gap-plan")!.score,
    );
  });

  test("returns UTF-16 highlight indices for names containing emoji", () => {
    expect(fuzzyMatch("note", "🔎note.md")?.indices).toEqual([2, 3, 4, 5]);
    expect(fuzzyMatch("🔎", "🔎note.md")?.indices).toEqual([0, 1]);
  });

  test("does not match hidden status metadata as a filename", () => {
    expect(rankPaletteFiles("file", [openNote], "open")).toEqual([]);
    expect(rankPaletteFiles("current", [openNote], "open")).toEqual([]);
  });

  test("caps results and prioritizes the active file", () => {
    const other = { ...openNote, id: "other" };
    expect(rankPaletteFiles("", [other, openNote], "open", 1).map((item) => item.noteId)).toEqual([
      "open",
    ]);
    expect(rankPaletteFiles("pro", [openNote], "open")[0].noteId).toBe("open");
    expect(rankPaletteFiles("notes", [openNote], "open")[0].indices).toEqual([]);
  });
});
