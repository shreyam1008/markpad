import { describe, expect, test } from "bun:test";

import { CommandRegistry, fuzzyMatch } from "../src/commands";

describe("fuzzyMatch", () => {
  test("matches characters in order and reports their positions", () => {
    expect(fuzzyMatch("mkpd", "Markpad")).toEqual({
      score: expect.any(Number),
      indices: [0, 3, 4, 6],
    });
  });

  test("ignores query whitespace and case", () => {
    expect(fuzzyMatch("M P", "markpad")?.indices).toEqual([0, 4]);
  });

  test("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("note", "Markpad")).toBeNull();
  });
});

describe("CommandRegistry", () => {
  test("filters disabled commands and searches metadata", () => {
    const registry = new CommandRegistry();
    registry.register(
      {
        id: "file.open",
        title: "Open file",
        category: "File",
        keywords: ["browse"],
        run: () => {},
      },
      {
        id: "file.save",
        title: "Save file",
        category: "File",
        keywords: ["write"],
        enabled: () => false,
        run: () => {},
      },
    );

    expect(registry.available().map((command) => command.id)).toEqual(["file.open"]);
    expect(registry.available("browse").map((command) => command.id)).toEqual(["file.open"]);
    expect(registry.available("write")).toEqual([]);
  });

  test("executes an available command and reports unknown commands", async () => {
    const calls: string[] = [];
    const registry = new CommandRegistry();
    registry.register({
      id: "view.preview",
      title: "Show preview",
      category: "View",
      run: async () => {
        calls.push("preview");
      },
    });

    expect(await registry.execute("view.preview")).toBe(true);
    expect(calls).toEqual(["preview"]);
    expect(await registry.execute("missing")).toBe(false);
  });
});
