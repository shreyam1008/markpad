import { afterEach, expect, test } from "bun:test";

import { previewSelection, writeClipboard } from "../src/preview/clipboard";

const originalWindow = globalThis.window;
afterEach(() => {
  globalThis.window = originalWindow;
});

test("preview copy accepts only non-collapsed selections wholly inside the pane", () => {
  const inside = {} as Node;
  const outside = {} as Node;
  const root = { contains: (node: Node) => node === inside } as HTMLElement;
  const selection = {
    anchorNode: inside,
    focusNode: inside,
    isCollapsed: false,
    toString: () => "Hello 🌍\nNext line",
  } as Selection;
  expect(previewSelection(root, selection)).toBe("Hello 🌍\nNext line");
  expect(previewSelection(root, { ...selection, focusNode: outside } as Selection)).toBe("");
  expect(previewSelection(root, { ...selection, anchorNode: outside } as Selection)).toBe("");
  expect(previewSelection(root, { ...selection, isCollapsed: true } as Selection)).toBe("");
  expect(previewSelection(root, null)).toBe("");
});

test("native clipboard preserves exact Unicode text and ignores an empty selection", async () => {
  const writes: string[] = [];
  globalThis.window = {
    runtime: {
      ClipboardSetText: async (text: string) => {
        writes.push(text);
        return true;
      },
    },
  } as unknown as Window & typeof globalThis;
  await writeClipboard("");
  await writeClipboard("Hello 🌍\nNext line");
  expect(writes).toEqual(["Hello 🌍\nNext line"]);
});

test("native clipboard failures are reported rather than claiming success", async () => {
  globalThis.window = { runtime: { ClipboardSetText: async () => false } } as unknown as Window &
    typeof globalThis;
  expect(writeClipboard("selected")).rejects.toThrow("Clipboard write failed");
});
