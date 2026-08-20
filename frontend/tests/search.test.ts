import { describe, expect, test } from "bun:test";

import { fuzzyMatch, rankPaletteFiles } from "../src/commands";
import {
  matchSelectionOffset,
  searchResultKey,
  splitSearchHighlight,
} from "../src/workspace/search";
import type { NoteInfo, WorkspaceFile, WorkspaceSearchResult } from "../src/workspace/types";

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

const workspaceFiles: WorkspaceFile[] = [
  {
    path: "/notes/project-plan.md",
    relative: "project-plan.md",
    name: "project-plan.md",
    kind: "markdown",
    size: 42,
    modified: "2026-08-13T10:00:00Z",
  },
  {
    path: "/notes/archive/proposal.md",
    relative: "archive/proposal.md",
    name: "proposal.md",
    kind: "markdown",
    size: 24,
    modified: "2026-08-13T10:00:00Z",
  },
];

describe("search helpers", () => {
  test("splits backend UTF-16 match offsets without changing the text", () => {
    const parts = splitSearchHighlight("prefix 🔎 match suffix", 10, 15);
    expect(parts).toEqual({ before: "prefix 🔎 ", match: "match", after: " suffix" });
    expect(parts.before + parts.match + parts.after).toBe("prefix 🔎 match suffix");
  });

  test("clamps malformed highlight offsets safely", () => {
    expect(splitSearchHighlight("note", -5, 99)).toEqual({
      before: "",
      match: "note",
      after: "",
    });
  });

  test("builds a stable result identity from path and location", () => {
    const result = {
      path: "/notes/a.md",
      relative: "a.md",
      line: 3,
      column: 4,
      text: "a match",
      matchStart: 2,
      matchEnd: 7,
    } satisfies WorkspaceSearchResult;
    expect(searchResultKey(result)).toBe("/notes/a.md\u00003\u00004");
  });

  test("maps one-based lines and UTF-16 columns to an editor selection offset", () => {
    const content = "first\n🔎 match here\nlast";
    expect(matchSelectionOffset(content, 2, 3)).toBe(9);
    expect(content.slice(9, 14)).toBe("match");
    expect(matchSelectionOffset(content, 99, 99)).toBe(content.length);
  });
});

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

  test("deduplicates workspace files that are already open", () => {
    const results = rankPaletteFiles("pro", [openNote], workspaceFiles, "open");
    expect(results.map((result) => result.id)).toEqual([
      "document.open",
      "workspace./notes/archive/proposal.md",
    ]);
  });

  test("finds unopened files through their relative folder path", () => {
    const results = rankPaletteFiles("arc", [], workspaceFiles, "");
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("/notes/archive/proposal.md");
    expect(results[0].indices).toEqual([]);
  });

  test("caps empty-query files without duplicating open workspace paths", () => {
    const results = rankPaletteFiles("", [openNote], workspaceFiles, "open", 2);
    expect(results.map((result) => result.id)).toEqual([
      "document.open",
      "workspace./notes/archive/proposal.md",
    ]);
  });
});
