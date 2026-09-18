import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { Sidebar } from "../src/components/Sidebar";
import type { OutlineItem, SessionState } from "../src/workspace/types";

const session: SessionState = { activeId: "", notes: [], favorites: [], recents: [] };
const noop = () => {};
function render(outline: OutlineItem[], collapsed = false) {
  return renderToStaticMarkup(
    <Sidebar
      session={session}
      collapsed={collapsed}
      outline={outline}
      onCollapse={noop}
      onOpen={noop}
      onNew={noop}
      onActivate={noop}
      onOpenPath={noop}
      onToggleStar={noop}
      onClose={noop}
      onRemoveRecent={noop}
      onReorder={noop}
      onContext={noop}
      onOutline={noop}
    />,
  );
}
const headings = (count: number): OutlineItem[] =>
  Array.from({ length: count }, (_, index) => ({
    level: (index % 6) + 1,
    line: index * 4,
    text: `Heading ${index}`,
  }));
const buttons = (html: string) => [...html.matchAll(/<button class="w-full py-1[^]*?<\/button>/g)];

describe("large sidebar outlines", () => {
  test("retains all14,000 heading buttons, text, order and indentation", () => {
    const outline = headings(14_000);
    const html = render(outline);
    const rendered = buttons(html);
    expect(rendered).toHaveLength(14_000);
    expect(html.match(/class="outline-render-group"/g)).toHaveLength(219);
    for (const [index, item] of outline.entries()) {
      expect(rendered[index][0]).toContain(`>${item.text}</button>`);
      expect(rendered[index][0]).toContain(`padding-left:${8 + (item.level - 1) * 10}px`);
      expect(rendered[index][0]).not.toContain("tabindex=");
      expect(rendered[index][0]).not.toContain("aria-hidden=");
    }
  });

  test("leaves512-entry outlines flat and groups only above the boundary", () => {
    for (const count of [0, 1, 64, 512]) {
      const html = render(headings(count));
      expect(html).not.toContain('class="outline-render-group"');
      expect(buttons(html)).toHaveLength(count);
    }
    const html = render(headings(513));
    expect(html.match(/class="outline-render-group"/g)).toHaveLength(9);
    expect(html).toContain("contain-intrinsic-block-size:auto calc(64lh + 512px)");
    expect(html).toContain("contain-intrinsic-block-size:auto calc(1lh + 8px)");
    expect(buttons(html)).toHaveLength(513);
  });

  test("escapes heading markup and omits the outline in the collapsed sidebar", () => {
    const outline = headings(600);
    outline[511].text = '<img src="x" onerror="bad()"> & title';
    const html = render(outline);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(render(outline, true)).not.toContain('class="outline-render-group"');
    expect(buttons(render(outline, true))).toHaveLength(0);
  });
});
