import { readTaskColors, setTaskColor } from "./task-colors";
export const TASK_MARKER = "<!-- quillpane:tasks -->";
export const TASK_TEMPLATE = `${TASK_MARKER}\n# Tasks\n\n`;
export const WORKFLOW_MARKER = "<!-- quillpane:workflow -->";
export const TASK_BOARD_TEMPLATE = `${TASK_MARKER}\n${WORKFLOW_MARKER}\n<!-- quillpane:categories ["Backlog","To do","Today","Done"] -->\n# Tasks\n\n`;
const CATEGORY_PREFIX = "<!-- quillpane:categories ";

/** Stable categorical color, independent of order, filters or completion. */
export function taskCategoryTone(category: string): string {
  if (!category) return "neutral";
  let hash = 0;
  for (const character of category) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return ["jade", "blue", "violet", "amber", "rose"][hash % 5];
}

interface SourceLine {
  text: string;
  start: number;
  end: number;
}
export interface TaskItem {
  start: number;
  end: number;
  source: string;
  title: string;
  checked: boolean;
  category: string;
  tags: string[];
  due: string;
  trashed: boolean;
  details: string;
}

export function isTaskDocument(content: string): boolean {
  return content.startsWith(`${TASK_MARKER}\n`) || content.startsWith(`${TASK_MARKER}\r\n`);
}

function categoryName(value: string): string {
  const name = value.trim();
  if (
    !name ||
    name.length > 40 ||
    /[<>]/.test(name) ||
    [...name].some((character) => character.charCodeAt(0) < 32) ||
    name.toLowerCase() === "untagged"
  )
    throw new Error(
      "Use a category name of 1–40 characters. Untagged is reserved for tasks without a category.",
    );
  return name;
}

export function parseTaskDocument(content: string) {
  if (!isTaskDocument(content)) throw new Error("This is not a Quillpane task file.");
  if (content.length > 200_000)
    throw new Error(
      "This task file is too large for the task view. Use Editor to work with the full file.",
    );
  const lines: SourceLine[] = [];
  let offset = 0;
  for (const raw of content.split(/(?<=\n)/)) {
    lines.push({ text: raw.replace(/\r?\n$/, ""), start: offset, end: offset + raw.length });
    offset += raw.length;
  }
  const tasks: TaskItem[] = [];
  const categories: string[] = [];
  let categoryLine: SourceLine | undefined;
  let trashStart: number | undefined;
  let trashEnd = content.length;
  let trashed = false;
  let fence = "";
  let fenceLength = 0;
  let title = "Tasks";
  let titleStart = 0;
  let workflow = false;
  const remember = (name: string) => {
    categoryName(name);
    if (!categories.includes(name)) categories.push(name);
    if (categories.length > 24)
      throw new Error(
        "Task view supports up to 24 categories. Use Editor to organize the full file.",
      );
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.text);
    if (delimiter) {
      if (!fence) {
        fence = delimiter[1][0];
        fenceLength = delimiter[1].length;
      } else if (
        delimiter[1][0] === fence &&
        delimiter[1].length >= fenceLength &&
        !delimiter[2].trim()
      )
        fence = "";
      continue;
    }
    if (fence) continue;
    if (line.text === WORKFLOW_MARKER) {
      workflow = true;
      continue;
    }
    if (line.text.startsWith(CATEGORY_PREFIX)) {
      if (categoryLine)
        throw new Error(
          "There are two category records. Use Editor to keep one; your file is unchanged.",
        );
      let names: unknown;
      try {
        names = JSON.parse(line.text.slice(CATEGORY_PREFIX.length, -4));
      } catch {
        throw new Error(
          "The category record is invalid. You can fix it in Editor; your file is unchanged.",
        );
      }
      if (
        !line.text.endsWith(" -->") ||
        !Array.isArray(names) ||
        names.some((name) => typeof name !== "string")
      )
        throw new Error("The category record must contain a list of names.");
      for (const name of names) remember(name);
      categoryLine = line;
      continue;
    }
    if (line.text.startsWith("# ")) {
      title = line.text.slice(2).trim() || "Tasks";
      titleStart = line.start;
    }
    const heading = /^##\s+(.+?)\s*#*\s*$/.exec(line.text);
    if (heading) {
      if (trashed) trashEnd = line.start;
      trashed = heading[1].toLowerCase() === "trash";
      if (trashed) {
        if (trashStart !== undefined)
          throw new Error(
            "There are two Trash sections. Keep one in Editor; your file is unchanged.",
          );
        trashStart = line.start;
      }
      continue;
    }
    const match = /^[-*+] \[([ xX])\] +(.+)$/.exec(line.text);
    if (!match) continue;
    const tag = /\s+<!-- category: (.*?) -->$/.exec(match[2]);
    const category = tag ? categoryName(tag[1]) : "";
    const withoutCategory = (tag ? match[2].slice(0, tag.index) : match[2]).trimEnd();
    const dueRecord = /\s+<!-- due: (.*?) -->$/.exec(withoutCategory);
    const due = dueRecord ? validateTaskDue(dueRecord[1]) : "";
    const withoutDue = (
      dueRecord ? withoutCategory.slice(0, dueRecord.index) : withoutCategory
    ).trimEnd();
    const labels = /\s+<!-- tags: (.*?) -->$/.exec(withoutDue);
    let tags: string[] = [];
    if (labels) {
      try {
        tags = taskTags(JSON.parse(labels[1]));
      } catch {
        throw new Error(
          "Invalid task tags. Use Editor to fix the list of tag names; your file is unchanged.",
        );
      }
    }
    if (category) remember(category);
    let last = index;
    while (
      last + 1 < lines.length &&
      (!lines[last + 1].text.trim() || /^[\t ]+\S/.test(lines[last + 1].text))
    )
      last++;
    const end = lines[last].end;
    tasks.push({
      start: line.start,
      end,
      source: content.slice(line.start, end),
      title: (labels ? withoutDue.slice(0, labels.index) : withoutDue).trimEnd(),
      checked: match[1].toLowerCase() === "x",
      category,
      tags,
      due,
      trashed,
      details: content
        .slice(line.end, end)
        .replace(/^[\t ]{1,4}/gm, "")
        .trim(),
    });
    if (tasks.length > 500)
      throw new Error(
        "This file has more than 500 tasks, including Trash. Use Editor to work with the full list.",
      );
    index = last;
  }
  if (fence) throw new Error("Close the code fence in Editor before using the task view.");
  return {
    title,
    titleStart,
    workflow,
    categories,
    tasks,
    categoryLine,
    trashStart,
    trashEnd,
    colors: readTaskColors(content),
  };
}

export function taskTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 8 || value.some((tag) => typeof tag !== "string"))
    throw new Error("Use up to 8 tags per task.");
  const tags: string[] = [];
  for (const raw of value as string[]) {
    const tag = raw.trim();
    if (
      !tag ||
      tag.length > 40 ||
      /[<>,\r\n\t]/.test(tag) ||
      [...tag].some((c) => c.charCodeAt(0) < 32)
    )
      throw new Error("Use tag names of 1–40 characters without commas or angle brackets.");
    if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  return tags;
}

function tagsSuffix(tags: string[]) {
  const names = taskTags(tags);
  return names.length ? ` <!-- tags: ${JSON.stringify(names)} -->` : "";
}

function taskTitle(value: string) {
  const title = value.trim();
  if (!title || /[\r\n]/.test(title)) throw new Error("Enter a task title on one line.");
  if (/<!-- (category|tags|due):/.test(title))
    throw new Error("Choose the category and tags separately from the task title.");
  return title;
}

function currentTask(content: string, task: TaskItem) {
  const current = parseTaskDocument(content).tasks.find((item) => item.start === task.start);
  if (!current || current.source !== task.source)
    throw new Error("This task changed. Please try again.");
  return current;
}

function eolFor(content: string) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}
function categorySuffix(category: string) {
  return category ? ` <!-- category: ${categoryName(category)} -->` : "";
}
function insertBlock(content: string, block: string, position: number) {
  const eol = eolFor(content);
  const before = content.slice(0, position);
  return (
    before +
    (before && !before.endsWith("\n") ? eol : "") +
    block +
    (block.endsWith("\n") ? "" : eol) +
    content.slice(position)
  );
}

export function addTask(
  content: string,
  title: string,
  category = "",
  tags: string[] = [],
  due = "",
) {
  const doc = parseTaskDocument(content);
  if (doc.tasks.length >= 500)
    throw new Error(
      "The task view supports 500 tasks including Trash. You can keep editing the file in Editor.",
    );
  if (category && !doc.categories.includes(category)) throw new Error("Category not found.");
  return insertBlock(
    content,
    `- [ ] ${taskTitle(title)}${tagsSuffix(tags)}${dueSuffix(due)}${categorySuffix(category)}${eolFor(content)}`,
    doc.trashStart ?? content.length,
  );
}

export interface TaskPatch {
  title?: string;
  checked?: boolean;
  category?: string;
  tags?: string[];
  due?: string;
  details?: string;
}
function taskBlock(task: TaskItem, patch: TaskPatch) {
  const first = task.source.match(/^[^\n]*(?:\n|$)/)![0];
  const eol = first.endsWith("\r\n") ? "\r\n" : first.endsWith("\n") ? "\n" : "";
  const prefix = /^([-*+] \[)[ xX](\] +)/.exec(first)!;
  let body = task.source.slice(first.length);
  let lineEnding = eol;
  if (patch.details !== undefined && patch.details !== task.details) {
    if (patch.details.length > 10000)
      throw new Error(
        "Keep task descriptions under 10,000 characters; use Editor for longer notes.",
      );
    lineEnding ||= "\n";
    const trailing = body.match(/(?:\r?\n[\t ]*)+$/)?.[0] ?? "";
    body = patch.details.trim()
      ? patch.details
          .trim()
          .split(/\r?\n/)
          .map((line) => `  ${line}`)
          .join(lineEnding) +
        lineEnding +
        trailing
      : trailing;
  }
  return `${prefix[1]}${(patch.checked ?? task.checked) ? "x" : " "}${prefix[2]}${taskTitle(patch.title ?? task.title)}${tagsSuffix(patch.tags ?? task.tags)}${dueSuffix(patch.due ?? task.due)}${categorySuffix(patch.category ?? task.category)}${lineEnding}${body}`;
}

export function updateTask(content: string, task: TaskItem, patch: TaskPatch) {
  currentTask(content, task);
  if (patch.category && !parseTaskDocument(content).categories.includes(patch.category))
    throw new Error("Category not found.");
  return content.slice(0, task.start) + taskBlock(task, patch) + content.slice(task.end);
}

/** Floating local date/time: never parse a date-only value as UTC. */
export function validateTaskDue(value: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?$/.exec(value);
  if (!match) throw new Error("Use a due date YYYY-MM-DD with an optional local time HH:mm.");
  const [year, month, day] = match.slice(1, 4).map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (
    year < 1000 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    throw new Error("Choose a valid due date.");
  return value;
}
function dueSuffix(value: string) {
  return value ? ` <!-- due: ${validateTaskDue(value)} -->` : "";
}
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseLocalDay(value: string): Date {
  validateTaskDue(value);
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  first.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from(
    { length: 42 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, 12),
  );
}
export function moveTaskCategory(
  content: string,
  name: string,
  before: string,
  placement: "before" | "after" = "before",
) {
  const names = [...parseTaskDocument(content).categories];
  if (!names.includes(name) || !names.includes(before)) throw new Error("Category not found.");
  if (name === before) return content;
  names.splice(names.indexOf(name), 1);
  names.splice(names.indexOf(before) + (placement === "after" ? 1 : 0), 0, name);
  return writeCategories(content, names);
}

/** Explicit, undoable upgrade: legacy categories become labels, not lost data. */
export function upgradeTaskWorkflow(content: string) {
  const doc = parseTaskDocument(content);
  if (doc.workflow) return content;
  const edits = doc.tasks.map((task) => ({
    start: task.start,
    end: task.end,
    text: taskBlock(task, {
      category: task.checked ? "Done" : "Backlog",
      tags: taskTags([...task.tags, ...(task.category ? [task.category] : [])]),
    }),
  }));
  if (doc.categoryLine)
    edits.push({ start: doc.categoryLine.start, end: doc.categoryLine.end, text: "" });
  for (const edit of edits.sort((a, b) => b.start - a.start))
    content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
  const at = content.indexOf("\n") + 1;
  const eol = eolFor(content);
  return (
    content.slice(0, at) +
    WORKFLOW_MARKER +
    eol +
    `${CATEGORY_PREFIX}["Backlog","To do","Today","Done"] -->${eol}` +
    content.slice(at)
  );
}

export function moveTask(
  content: string,
  task: TaskItem,
  category: string,
  before?: TaskItem,
  placement: "before" | "after" = "before",
) {
  currentTask(content, task);
  if (task.trashed || before?.trashed) throw new Error("Restore tasks before moving them.");
  if (before) currentTask(content, before);
  if (before?.start === task.start) return content;
  if (category && !parseTaskDocument(content).categories.includes(category))
    throw new Error("Category not found.");
  const remaining = content.slice(0, task.start) + content.slice(task.end);
  const position = before
    ? (placement === "after" ? before.end : before.start) -
      (task.start < before.start ? task.end - task.start : 0)
    : (parseTaskDocument(remaining).trashStart ?? remaining.length);
  return insertBlock(remaining, taskBlock(task, { category }), position);
}

export function trashTask(content: string, task: TaskItem) {
  currentTask(content, task);
  if (task.trashed) return content;
  let remaining = content.slice(0, task.start) + content.slice(task.end);
  let doc = parseTaskDocument(remaining);
  if (doc.trashStart === undefined) {
    const eol = eolFor(content);
    remaining += `${remaining.endsWith("\n") ? "" : eol}${eol}## Trash${eol}${eol}`;
    doc = parseTaskDocument(remaining);
  }
  return insertBlock(remaining, task.source, doc.trashEnd);
}

export function restoreTask(content: string, task: TaskItem) {
  currentTask(content, task);
  if (!task.trashed) return content;
  const remaining = content.slice(0, task.start) + content.slice(task.end);
  return insertBlock(
    remaining,
    task.source,
    parseTaskDocument(remaining).trashStart ?? remaining.length,
  );
}

export function emptyTaskTrash(content: string) {
  const tasks = parseTaskDocument(content).tasks.filter((task) => task.trashed);
  for (const task of tasks.reverse())
    content = content.slice(0, task.start) + content.slice(task.end);
  return content;
}

/** Batch moves preserve whole task blocks and never rewrite unrelated source. */
export function moveCompletedToTrash(content: string) {
  const tasks = parseTaskDocument(content).tasks.filter((task) => !task.trashed && task.checked);
  if (!tasks.length) return content;
  let remaining = content;
  for (const task of [...tasks].reverse())
    remaining = remaining.slice(0, task.start) + remaining.slice(task.end);
  let doc = parseTaskDocument(remaining);
  const eol = eolFor(content);
  if (doc.trashStart === undefined) {
    remaining += `${remaining.endsWith("\n") ? "" : eol}${eol}## Trash${eol}${eol}`;
    doc = parseTaskDocument(remaining);
  }
  return insertBlock(
    remaining,
    tasks.map((task) => task.source + (task.source.endsWith("\n") ? "" : eol)).join(""),
    doc.trashEnd,
  );
}

export function restoreAllTasks(content: string) {
  const tasks = parseTaskDocument(content).tasks.filter((task) => task.trashed);
  if (!tasks.length) return content;
  let remaining = content;
  for (const task of [...tasks].reverse())
    remaining = remaining.slice(0, task.start) + remaining.slice(task.end);
  const eol = eolFor(content);
  return insertBlock(
    remaining,
    tasks.map((task) => task.source + (task.source.endsWith("\n") ? "" : eol)).join(""),
    parseTaskDocument(remaining).trashStart!,
  );
}

export function reorderTaskCategory(content: string, name: string, direction: -1 | 1) {
  const names = [...parseTaskDocument(content).categories];
  const index = names.indexOf(name);
  if (index < 0) throw new Error("Category not found.");
  const target = index + direction;
  if (target < 0 || target >= names.length) return content;
  [names[index], names[target]] = [names[target], names[index]];
  return writeCategories(content, names);
}

function writeCategories(content: string, names: string[]) {
  if (names.length > 24) throw new Error("You can have up to 24 categories in this task view.");
  const doc = parseTaskDocument(content);
  const metadata = `${CATEGORY_PREFIX}${JSON.stringify(names)} -->${eolFor(content)}`;
  if (doc.categoryLine)
    return (
      content.slice(0, doc.categoryLine.start) + metadata + content.slice(doc.categoryLine.end)
    );
  const afterMarker = content.indexOf("\n") + 1;
  return content.slice(0, afterMarker) + metadata + content.slice(afterMarker);
}

export function addTaskCategory(content: string, value: string) {
  const name = categoryName(value);
  const doc = parseTaskDocument(content);
  if (doc.categories.some((category) => category.toLowerCase() === name.toLowerCase()))
    throw new Error("That category already exists.");
  return writeCategories(content, [...doc.categories, name]);
}

/** Removing a category keeps its tasks, including Trash, and makes them Untagged. */
export function changeTaskCategory(content: string, oldName: string, newName: string) {
  const name = newName ? categoryName(newName) : "";
  const doc = parseTaskDocument(content);
  if (!doc.categories.includes(oldName)) throw new Error("Category not found.");
  if (
    name &&
    doc.categories.some(
      (category) => category !== oldName && category.toLowerCase() === name.toLowerCase(),
    )
  )
    throw new Error("That category already exists.");
  const names = doc.categories.flatMap((category) =>
    category === oldName ? (name ? [name] : []) : [category],
  );
  // Apply all edits against original offsets, avoiding a temporary extra category.
  const edits = doc.tasks
    .filter((task) => task.category === oldName)
    .map((task) => ({
      start: task.start,
      end: task.end,
      text: taskBlock(task, { category: name }),
    }));
  const afterMarker = content.indexOf("\n") + 1;
  edits.push({
    start: doc.categoryLine?.start ?? afterMarker,
    end: doc.categoryLine?.end ?? afterMarker,
    text: `${CATEGORY_PREFIX}${JSON.stringify(names)} -->${eolFor(content)}`,
  });
  for (const edit of edits.sort((a, b) => b.start - a.start))
    content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
  const color = doc.colors.categories[oldName];
  if (color && Object.hasOwn(doc.colors.categories, oldName)) {
    content = setTaskColor(content, "categories", oldName);
    if (name) content = setTaskColor(content, "categories", name, color);
  }
  return content;
}
