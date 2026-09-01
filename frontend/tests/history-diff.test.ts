import { describe, expect, test } from "bun:test";

import { diffLines, summarizeDiff } from "../src/history/diff";

describe("history diff", () => {
  test("keeps following lines aligned after an insertion", () => {
    const rows = diffLines("alpha\ninserted\nbeta\ngamma", "alpha\nbeta\ngamma");
    expect(rows.map(({ kind, text }) => [kind, text])).toEqual([
      ["ctx", "alpha"],
      ["add", "inserted"],
      ["ctx", "beta"],
      ["ctx", "gamma"],
    ]);
    expect(rows[1].afterLine).toBe(2);
    expect(rows[1].beforeLine).toBeUndefined();
  });

  test("reports Git-style addition and deletion totals", () => {
    const rows = diffLines("alpha\nnew\nomega", "alpha\nold\nomega");
    expect(summarizeDiff(rows)).toEqual({ additions: 1, deletions: 1 });
  });

  test("bounds pathological diffs", () => {
    const before = Array.from({ length: 900 }, (_, index) => `before-${index}`).join("\n");
    const after = Array.from({ length: 900 }, (_, index) => `after-${index}`).join("\n");
    expect(diffLines(after, before)).toEqual([
      { kind: "ctx", text: "Diff is too large to display safely." },
    ]);
  });
});
