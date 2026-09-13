import { describe, expect, test } from "bun:test";

import {
  TASK_TEMPLATE,
  TASK_BOARD_TEMPLATE,
  upgradeTaskWorkflow,
  validateTaskDue,
  calendarDays,
  localDateKey,
  parseLocalDay,
  moveTaskCategory,
  addTask,
  addTaskCategory,
  changeTaskCategory,
  emptyTaskTrash,
  isTaskDocument,
  moveTask,
  parseTaskDocument,
  restoreTask,
  trashTask,
  updateTask,
  moveCompletedToTrash,
  restoreAllTasks,
  reorderTaskCategory,
} from "../src/workspace/tasks";

const items = (source: string) => parseTaskDocument(source).tasks;
const find = (source: string, title: string) => items(source).find((task) => task.title === title)!;

describe("file-backed tasks", () => {
  test("local due dates validate leap days and preserve wall-clock times", () => {
    expect(validateTaskDue("2028-02-29T23:59")).toBe("2028-02-29T23:59");
    for (const value of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-01-01T24:00",
      "2026-01-01T12:60",
      "2026-01-01Z",
    ])
      expect(() => validateTaskDue(value)).toThrow();
    expect(localDateKey(parseLocalDay("2026-09-13"))).toBe("2026-09-13");
    const days = calendarDays(new Date(2026, 8, 1, 12));
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(1);
    expect(localDateKey(days[0])).toBe("2026-08-31");
    expect(localDateKey(days[41])).toBe("2026-10-11");
  });
  test("due dates and descriptions survive all task lifecycle edits", () => {
    let source = addTask(
      TASK_BOARD_TEMPLATE.replaceAll("\n", "\r\n"),
      "Meet",
      "Today",
      ["Work"],
      "2026-09-14T09:30",
    );
    source = updateTask(source, find(source, "Meet"), {
      details: "Bring the draft\nDiscuss next steps",
    });
    expect(find(source, "Meet")).toMatchObject({
      due: "2026-09-14T09:30",
      details: "Bring the draft\r\nDiscuss next steps",
    });
    source = moveTask(source, find(source, "Meet"), "Done");
    source = trashTask(source, find(source, "Meet"));
    source = restoreAllTasks(source);
    source = updateTask(source, find(source, "Meet"), { checked: true });
    expect(find(source, "Meet")).toMatchObject({
      due: "2026-09-14T09:30",
      tags: ["Work"],
      checked: true,
    });
    expect(source.replaceAll("\r\n", "")).not.toContain("\n");
    source = updateTask(source, find(source, "Meet"), { due: "", details: "" });
    expect(find(source, "Meet")).toMatchObject({ due: "", details: "" });
    expect(() => addTask(source, "Bad", "Today", [], "2026-02-30")).toThrow();
  });
  test("dragging categories persists order without rewriting card blocks", () => {
    const source = addTask(TASK_BOARD_TEMPLATE, "A", "Today", ["Work"], "2026-09-13");
    const moved = moveTaskCategory(source, "Done", "Backlog");
    expect(parseTaskDocument(moved).categories).toEqual(["Done", "Backlog", "To do", "Today"]);
    expect(find(moved, "A").source).toBe(find(source, "A").source);
    expect(moveTaskCategory(moved, "Done", "Done")).toBe(moved);
    expect(() => moveTaskCategory(moved, "Missing", "Done")).toThrow();
  });
  test("workflow columns and multiple tags survive moving, trash, restore and editing", () => {
    let source = addTask(TASK_BOARD_TEMPLATE.replaceAll("\n", "\r\n"), "Review", "Today", [
      "Work",
      "Personal",
    ]);
    source += "  Keep these notes\r\n";
    expect(parseTaskDocument(source).workflow).toBe(true);
    expect(parseTaskDocument(source).categories).toEqual(["Backlog", "To do", "Today", "Done"]);
    source = moveTask(source, find(source, "Review"), "Done");
    source = trashTask(source, find(source, "Review"));
    source = restoreAllTasks(source);
    source = updateTask(source, find(source, "Review"), { title: "Reviewed", checked: true });
    expect(find(source, "Reviewed")).toMatchObject({
      category: "Done",
      tags: ["Work", "Personal"],
      checked: true,
      details: "Keep these notes",
    });
    source = changeTaskCategory(source, "Done", "Finished");
    expect(find(source, "Reviewed").tags).toEqual(["Work", "Personal"]);
    expect(source.replaceAll("\r\n", "")).not.toContain("\n");
  });

  test("legacy upgrade preserves completion, tags, details, Trash and unrelated source at the category limit", () => {
    let source = TASK_TEMPLATE;
    for (let i = 0; i < 24; i++) source = addTaskCategory(source, `Group ${i}`);
    source = addTask(source, "Open", "Group 0", ["Existing"]) + "  Notes\n";
    source = addTask(source, "Complete", "Group 23");
    source = updateTask(source, find(source, "Complete"), { checked: true });
    source = trashTask(source, find(source, "Complete")) + "\n## Reference\nKeep this prose\n";
    const upgraded = upgradeTaskWorkflow(source);
    expect(find(upgraded, "Open")).toMatchObject({
      category: "Backlog",
      tags: ["Existing", "Group 0"],
      details: "Notes",
    });
    expect(find(upgraded, "Complete")).toMatchObject({
      category: "Done",
      tags: ["Group 23"],
      checked: true,
      trashed: true,
    });
    expect(upgraded.endsWith("## Reference\nKeep this prose\n")).toBe(true);
    expect(upgradeTaskWorkflow(upgraded)).toBe(upgraded);
  });

  test("tag validation refuses injection and malformed metadata and deduplicates labels", () => {
    const source = addTask(TASK_BOARD_TEMPLATE, "A", "Backlog", ["Work", "work", "Personal"]);
    expect(find(source, "A").tags).toEqual(["Work", "Personal"]);
    expect(() => updateTask(source, find(source, "A"), { tags: ["x -->"] })).toThrow();
    expect(() =>
      addTask(
        source,
        "B",
        "Today",
        Array.from({ length: 9 }, (_, i) => `Tag${i}`),
      ),
    ).toThrow();
    expect(() =>
      parseTaskDocument(TASK_BOARD_TEMPLATE + "- [ ] Broken <!-- tags: nope -->\n"),
    ).toThrow("Invalid task tags");
    expect(() => addTask(source, 'Title <!-- tags: ["Hidden"] -->')).toThrow();
    expect(updateTask(source, find(source, "A"), { tags: [] })).not.toContain("<!-- tags:");
  });
  test("batch cleanup and restore preserve notes, categories, CRLF and unrelated sections", () => {
    const source =
      addTaskCategory(TASK_TEMPLATE.replaceAll("\n", "\r\n"), "Work") +
      "- [x] Done <!-- category: Work -->\r\n  Keep this detail\r\n\r\n- [ ] Open\r\n\r\n## Trash\r\n\r\n- [ ] Earlier\r\n\r\n## Reference\r\nKeep this prose\r\n";
    const cleaned = moveCompletedToTrash(source);
    expect(find(cleaned, "Done")).toMatchObject({
      checked: true,
      trashed: true,
      category: "Work",
      details: "Keep this detail",
    });
    expect(find(cleaned, "Open").trashed).toBe(false);
    expect(cleaned.endsWith("## Reference\r\nKeep this prose\r\n")).toBe(true);
    expect(cleaned.replaceAll("\r\n", "")).not.toContain("\n");
    const restored = restoreAllTasks(cleaned);
    expect(items(restored).every((task) => !task.trashed)).toBe(true);
    expect(items(restored).map((task) => task.title)).toEqual(["Open", "Earlier", "Done"]);
    expect(find(restored, "Done").details).toBe("Keep this detail");
    expect(restoreAllTasks(restored)).toBe(restored);
    expect(moveCompletedToTrash(TASK_TEMPLATE)).toBe(TASK_TEMPLATE);
  });

  test("moving after another category preserves both categories and attached notes", () => {
    const source =
      addTaskCategory(TASK_TEMPLATE, "Work") +
      "- [ ] A\n  A detail\n\n- [ ] B <!-- category: Work -->\n  B detail\n\n- [ ] C\n";
    const moved = moveTask(source, find(source, "A"), "", find(source, "B"), "after");
    expect(items(moved).map((task) => [task.title, task.category, task.details])).toEqual([
      ["B", "Work", "B detail"],
      ["A", "", "A detail"],
      ["C", "", ""],
    ]);
    const lastFirst = moveTask(moved, find(moved, "C"), "", find(moved, "B"), "after");
    expect(items(lastFirst).map((task) => task.title)).toEqual(["B", "C", "A"]);
  });

  test("category order persists without changing task order or empty columns", () => {
    let source = addTaskCategory(addTaskCategory(TASK_TEMPLATE, "Work"), "Personal");
    source = addTaskCategory(source, "Ideas");
    source = addTask(source, "A", "Work");
    const moved = reorderTaskCategory(source, "Personal", -1);
    expect(parseTaskDocument(moved).categories).toEqual(["Personal", "Work", "Ideas"]);
    expect(find(moved, "A").source).toBe(find(source, "A").source);
    expect(reorderTaskCategory(moved, "Personal", -1)).toBe(moved);
    expect(() => reorderTaskCategory(moved, "Missing", 1)).toThrow("not found");
  });

  test("categories are independent of completion and empty columns persist", () => {
    let source = addTaskCategory(TASK_TEMPLATE, "Work");
    source = addTaskCategory(source, "Personal");
    source = addTask(source, "Send proposal", "Work");
    source = addTask(source, "Think");
    source = updateTask(source, find(source, "Send proposal"), { checked: true });
    expect(parseTaskDocument(source).categories).toEqual(["Work", "Personal"]);
    expect(items(source).map(({ category, checked }) => [category, checked])).toEqual([
      ["Work", true],
      ["", false],
    ]);
    expect(isTaskDocument("# Ordinary note\n- [ ] Task")).toBe(false);
  });

  test("preserves CRLF, attached notes, fenced examples, and unrelated prose", () => {
    const prose = "\r\nParagraph stays exactly.\r\n```md\r\n- [ ] Example\r\n```\r\n";
    const source =
      TASK_TEMPLATE.replaceAll("\n", "\r\n") +
      "* [X]  Unicode café 日本語\r\n    detail\r\n    - nested note\r\n" +
      prose;
    expect(items(source)).toHaveLength(1);
    const edited = updateTask(source, items(source)[0], { title: "Renamed", checked: false });
    expect(edited).toContain("* [ ]  Renamed\r\n    detail\r\n    - nested note\r\n");
    expect(edited.endsWith(prose)).toBe(true);
    expect(edited.replaceAll("\r\n", "")).not.toContain("\n");
  });

  test("moves tasks across categories and reorders without duplicating or losing notes", () => {
    let source = addTaskCategory(TASK_TEMPLATE, "Work");
    for (const title of ["A", "B", "C"]) source = addTask(source, title);
    source = moveTask(source, find(source, "C"), "", find(source, "A"));
    expect(items(source).map((task) => task.title)).toEqual(["C", "A", "B"]);
    source = moveTask(source, find(source, "C"), "", find(source, "B"));
    expect(items(source).map((task) => task.title)).toEqual(["A", "C", "B"]);
    source = moveTask(source, find(source, "A"), "Work");
    expect(find(source, "A").category).toBe("Work");
    expect(moveTask(source, find(source, "A"), "Work", find(source, "A"))).toBe(source);
    expect(items(source)).toHaveLength(3);
  });

  test("trash and restore preserve category, completion, notes and later sections", () => {
    let source =
      addTaskCategory(TASK_TEMPLATE, "Work") +
      "- [x] A <!-- category: Work -->\n  Important detail\n\n- [ ] B\n\n## Trash\n\n## Reference\nUnrelated prose\n";
    source = trashTask(source, find(source, "A"));
    expect(find(source, "A")).toMatchObject({
      trashed: true,
      checked: true,
      category: "Work",
      details: "Important detail",
    });
    expect(source.indexOf("- [x] A")).toBeLessThan(source.indexOf("## Reference"));
    source = restoreTask(source, find(source, "A"));
    expect(find(source, "A")).toMatchObject({
      trashed: false,
      checked: true,
      category: "Work",
      details: "Important detail",
    });
    source = trashTask(source, find(source, "A"));
    source = emptyTaskTrash(source);
    expect(items(source).map((task) => task.title)).toEqual(["B"]);
    expect(source.endsWith("## Reference\nUnrelated prose\n")).toBe(true);
  });

  test("creates Trash only once and restores into the active list", () => {
    let source = addTask(addTask(TASK_TEMPLATE, "A"), "B");
    source = trashTask(source, find(source, "A"));
    source = trashTask(source, find(source, "B"));
    source = addTask(source, "C");
    expect(source.match(/## Trash/g)).toHaveLength(1);
    expect(find(source, "C").trashed).toBe(false);
    source = restoreTask(source, find(source, "A"));
    expect(
      items(source)
        .filter((task) => !task.trashed)
        .map((task) => task.title),
    ).toEqual(["C", "A"]);
  });

  test("renaming at the category limit is atomic and removing keeps active and trashed tasks", () => {
    let source = TASK_TEMPLATE;
    for (let index = 0; index < 24; index++) source = addTaskCategory(source, `Category ${index}`);
    source = addTask(addTask(source, "A", "Category 0"), "B", "Category 0");
    source = trashTask(source, find(source, "B"));
    source = changeTaskCategory(source, "Category 0", "New name");
    expect(parseTaskDocument(source).categories).toHaveLength(24);
    expect(items(source).every((task) => task.category === "New name")).toBe(true);
    source = changeTaskCategory(source, "New name", "");
    expect(items(source).map((task) => [task.category, task.trashed])).toEqual([
      ["", false],
      ["", true],
    ]);
    expect(parseTaskDocument(source).categories).toHaveLength(23);
  });

  test("refuses invalid records, category injection, and stale references", () => {
    expect(() => parseTaskDocument(TASK_TEMPLATE + "<!-- quillpane:categories nope -->\n")).toThrow(
      "invalid",
    );
    expect(() => addTaskCategory(TASK_TEMPLATE, "Bad --> tag")).toThrow();
    expect(() => addTaskCategory(TASK_TEMPLATE, "Untagged")).toThrow();
    const source = addTaskCategory(addTask(TASK_TEMPLATE, "A"), "Work");
    expect(() => addTaskCategory(source, "work")).toThrow("already exists");
    const stale = items(source)[0];
    const changed = updateTask(source, stale, { checked: true });
    expect(() => trashTask(changed, stale)).toThrow("changed");
    expect(() => parseTaskDocument(TASK_TEMPLATE + "## Trash\n## Trash\n")).toThrow("two Trash");
    expect(() => addTask(TASK_TEMPLATE + "```md\n", "Must not hide in a code block")).toThrow(
      "code fence",
    );
  });

  test("bounds task rendering while leaving oversized source accessible", () => {
    const source = TASK_TEMPLATE + "- [ ] Task\n".repeat(500);
    expect(items(source)).toHaveLength(500);
    expect(() => addTask(source, "One more")).toThrow("500");
    expect(() => parseTaskDocument(source + "- [ ] Extra\n")).toThrow("500");
    expect(() => parseTaskDocument(TASK_TEMPLATE + "a".repeat(200_000))).toThrow("too large");
  });
});
