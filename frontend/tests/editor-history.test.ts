import { describe, expect, test } from "bun:test";

import { shouldCoalesceLargeEdit } from "../src/history/edit";

describe("large editor history", () => {
  test("keeps the first undo boundary for a large file", () => {
    expect(shouldCoalesceLargeEdit(2_097_152, 1, 0, 100)).toBe(false);
  });

  test("coalesces rapid full-document snapshots at the workspace limit", () => {
    expect(shouldCoalesceLargeEdit(2_097_152, 2, 1_000, 1_499)).toBe(true);
    expect(shouldCoalesceLargeEdit(2_097_152, 2, 1_000, 1_500)).toBe(false);
  });

  test("preserves fine-grained history for ordinary files", () => {
    expect(shouldCoalesceLargeEdit(255_999, 20, 1_000, 1_100)).toBe(false);
  });
});
