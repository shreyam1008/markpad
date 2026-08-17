import { describe, expect, test } from "bun:test";

import { classifySaveResult } from "../src/save-result";

describe("classifySaveResult", () => {
  test("detects a cancelled first save", () => {
    expect(
      classifySaveResult({
        mode: "save",
        previousPath: "",
        nextPath: "",
        wasDirty: false,
        isDirty: false,
      }),
    ).toBe("cancelled");
  });

  test("recognizes path changes and dirty-to-clean saves", () => {
    expect(
      classifySaveResult({
        mode: "save-as",
        previousPath: "/notes/a.md",
        nextPath: "/notes/b.md",
        wasDirty: false,
        isDirty: false,
      }),
    ).toBe("saved");
    expect(
      classifySaveResult({
        mode: "save-as",
        previousPath: "/notes/a.md",
        nextPath: "/notes/a.md",
        wasDirty: true,
        isDirty: false,
      }),
    ).toBe("saved");
  });

  test("keeps a clean unchanged Save As result neutral", () => {
    expect(
      classifySaveResult({
        mode: "save-as",
        previousPath: "/notes/a.md",
        nextPath: "/notes/a.md",
        wasDirty: false,
        isDirty: false,
      }),
    ).toBe("unchanged");
  });
});
