import { expect, test } from "bun:test";

import {
  readTaskColors,
  setTaskColor,
  validTaskColor,
  automaticTaskColor,
  colorRGB,
} from "../src/workspace/task-colors";
import { parseTaskDocument, updateTask, changeTaskCategory } from "../src/workspace/tasks";
test("task color changes preserve tasks and survive unrelated edits and CRLF", () => {
  const source =
    "<!-- quillpane:tasks -->\r\n# Tasks\r\n\r\n- [ ] Read a note <!-- category: Work -->\r\n  Keep this context.\r\n";
  const color = { l: 0.65, c: 0.14, h: 240 };
  const colored = setTaskColor(source, "categories", "Work", color);
  expect(readTaskColors(colored).categories.Work).toEqual(color);
  expect(colored.replace(/<!-- quillpane:colors .* -->\r\n/, "")).toBe(source);
  const doc = parseTaskDocument(colored);
  const updated = updateTask(colored, doc.tasks[0], { checked: true });
  expect(readTaskColors(updated).categories.Work).toEqual(color);
  expect(updated).toContain("Keep this context.\r\n");
  expect(
    readTaskColors(setTaskColor(updated, "categories", "Work")).categories.Work,
  ).toBeUndefined();
});
test("colors are bounded numeric data, distinct from tag names and CSS", () => {
  for (const bad of [
    { l: Infinity, c: 0.1, h: 1 },
    { l: 0.6, c: 1, h: 1 },
    { l: 0.6, c: 0.1, h: -1 },
    { l: 0.6, c: 0.1, h: "red" },
  ])
    expect(() => validTaskColor(bad)).toThrow();
  const source = "<!-- quillpane:tasks -->\n# Tasks\n";
  const next = setTaskColor(
    setTaskColor(source, "tags", "Work", { l: 0.6, c: 0.1, h: 100 }),
    "categories",
    "Work",
    { l: 0.7, c: 0.2, h: 250 },
  );
  expect(readTaskColors(next).tags.Work.h).toBe(100);
  expect(readTaskColors(next).categories.Work.h).toBe(250);
  expect(automaticTaskColor("Work")).toEqual(automaticTaskColor("work"));
  expect(automaticTaskColor("Work").h).not.toBe(automaticTaskColor("Personal").h);
  expect(colorRGB({ l: 1, c: 0, h: 0 })).toEqual([255, 255, 255]);
  expect(colorRGB({ l: 0, c: 0, h: 0 })).toEqual([0, 0, 0]);
});

test("fenced color examples are prose, and renaming a category retains its color", () => {
  const source =
    "<!-- quillpane:tasks -->\n# Tasks\n\n```md\n<!-- quillpane:colors invalid example -->\n```\n- [ ] Task <!-- category: Work -->\n";
  expect(readTaskColors(source).categories).toEqual({});
  const colored = setTaskColor(source, "categories", "Work", { l: 0.6, c: 0.12, h: 25 });
  const renamed = changeTaskCategory(colored, "Work", "Office");
  expect(readTaskColors(renamed).categories.Office.h).toBe(25);
  expect(readTaskColors(renamed).categories.Work).toBeUndefined();
  expect(renamed).toContain("<!-- quillpane:colors invalid example -->");
});

test("prototype-like labels remain ordinary color names", () => {
  const source = "<!-- quillpane:tasks -->\n# Tasks\n";
  expect(Number.isFinite(automaticTaskColor("constructor").h)).toBe(true);
  const next = setTaskColor(source, "tags", "__proto__", { l: 0.6, c: 0.1, h: 200 });
  expect(readTaskColors(next).tags.__proto__.h).toBe(200);
  expect(readTaskColors(source).tags.constructor).toBeUndefined();
});
