import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { colorStyle } from "../src/components/TaskAppearance";
import { TaskTagPicker } from "../src/components/TaskControls";
import {
  automaticTaskColor,
  colorRGB,
  emptyTaskColors,
  type TaskColor,
} from "../src/workspace/task-colors";

function expectedStyle(color: TaskColor) {
  return {
    "--task-custom-light": `rgb(${colorRGB({ ...color, l: 0.42, c: Math.min(color.c, 0.13) }).join(" ")})`,
    "--task-custom-dark": `rgb(${colorRGB({ ...color, l: 0.82, c: Math.min(color.c, 0.13) }).join(" ")})`,
    "--task-custom-rgb": colorRGB(color).join(" "),
  };
}

describe("task presentation work", () => {
  test("closed tag pickers do not scan global options or change visible pills", () => {
    let reads = 0;
    const options = new Proxy(["Work", "Personal"], {
      get(target, key, receiver) {
        if (key === Symbol.iterator) reads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const html = renderToStaticMarkup(
      <TaskTagPicker value={["Work"]} options={options} label="Task tags" onChange={() => {}} />,
    );
    expect(reads).toBe(0);
    expect(html).toContain('aria-label="Task tags"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">Work</span>");
    expect(html).not.toContain("Personal");
    expect(html).not.toContain("data-task-popup");
  });

  test("reuses immutable color styles for repeated category/tag roles", () => {
    const colors = emptyTaskColors();
    for (const name of ["Backlog", "To do", "Work", "Personal", "__proto__", ""]) {
      const style = colorStyle(colors, "categories", name);
      expect(style).toEqual(expectedStyle(automaticTaskColor(name)));
      expect(colorStyle(colors, "categories", name)).toBe(style);
      expect(Object.isFrozen(style)).toBe(true);
    }
  });

  test("custom color edits, replacement and reset invalidate without stale paint", () => {
    const colors = emptyTaskColors();
    const automatic = colorStyle(colors, "tags", "Work");
    colors.tags.Work = { l: 0.6, c: 0.12, h: 42 };
    const customized = colorStyle(colors, "tags", "Work");
    expect(customized).toEqual(expectedStyle(colors.tags.Work));
    expect(customized).not.toBe(automatic);
    colors.tags.Work.h = 240;
    const edited = colorStyle(colors, "tags", "Work");
    expect(edited).toEqual(expectedStyle(colors.tags.Work));
    expect(edited).not.toBe(customized);
    colors.tags.Work = { l: 0.72, c: 0.1, h: 155 };
    expect(colorStyle(colors, "tags", "Work")).toEqual(expectedStyle(colors.tags.Work));
    delete colors.tags.Work;
    expect(colorStyle(colors, "tags", "Work")).toEqual(automatic);
  });

  test("category/tag colors and separate document generations stay independent", () => {
    const colors = emptyTaskColors();
    colors.categories.Work = { l: 0.65, c: 0.14, h: 245 };
    colors.tags.Work = { l: 0.6, c: 0.1, h: 42 };
    expect(colorStyle(colors, "tags", "Work")).not.toEqual(
      colorStyle(colors, "categories", "Work"),
    );
    expect(colorStyle(emptyTaskColors(), "tags", "Work")).toEqual(
      expectedStyle(automaticTaskColor("Work")),
    );
  });

  test("bounds retained automatically colored names in each live document", () => {
    const colors = emptyTaskColors();
    const first = colorStyle(colors, "tags", "first");
    for (let index = 0; index < 256; index++) colorStyle(colors, "tags", `tag-${index}`);
    const returned = colorStyle(colors, "tags", "first");
    expect(returned).toEqual(first);
    expect(returned).not.toBe(first);
  });
});
