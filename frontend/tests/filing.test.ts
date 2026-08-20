import { describe, expect, test } from "bun:test";

import { suggestWorkspaceDraftPath } from "../src/workspace/filing";

describe("workspace draft filing", () => {
  test("turns the first useful Markdown line into a local file name", () => {
    expect(suggestWorkspaceDraftPath("# Launch Plan\n\nShip it.", "md", [])).toBe("launch-plan.md");
    expect(suggestWorkspaceDraftPath("\n- [ ] Call José @ 5pm", "txt", [])).toBe(
      "call-josé-5pm.txt",
    );
  });

  test("offers a case-insensitive collision-free suggestion", () => {
    expect(
      suggestWorkspaceDraftPath("# Launch Plan", "md", [
        "launch-plan.md",
        "LAUNCH-PLAN-2.MD",
        "archive/launch-plan-3.md",
      ]),
    ).toBe("launch-plan-3.md");
  });

  test("uses a bounded fallback for punctuation-only or long drafts", () => {
    expect(suggestWorkspaceDraftPath("---", "md", [])).toBe("untitled.md");
    const suggestion = suggestWorkspaceDraftPath(`# ${"word ".repeat(40)}`, "md", []);
    expect(suggestion.endsWith(".md")).toBe(true);
    expect(suggestion.length).toBeLessThanOrEqual(67);
  });
});
