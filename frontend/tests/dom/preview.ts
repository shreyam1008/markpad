// A separate process gives DOMPurify a real DOM before its module initializes.
// This checks sanitization and tree fidelity; native layout is tested separately.
import assert from "node:assert/strict";

import { Window } from "happy-dom";

const window = new Window();
Object.assign(globalThis, { window, document: window.document, Node: window.Node });
const { renderMarkdown, parseMarkdown, renderCode, escapeHTML } =
  await import("../../src/preview/render");
const { default: DOMPurify } = await import("dompurify");
const document = window.document;

const cases = [
  "# Small note\n\nHello **world**.\n",
  "# Large note\n\n" + "A long paragraph. ".repeat(20_000),
  Array.from(
    { length: 700 },
    (_, i) =>
      `## Section ${i}\n\n${"Text with **bold**, [reference][link] and <em>HTML</em>. ".repeat(5)}\n\n`,
  ).join("") + "\n[link]: https://example.com\n",
  Array.from(
    { length: 600 },
    (_, i) =>
      `## Table ${i}\n\n| Left | Right |\n| --- | --- |\n| text | \`code\` |\n\n- [ ] task\n- nested\n  - child\n\n`,
  ).join(""),
  "<div>\n\n" + "## Heading\n\nparagraph **bold**\n\n".repeat(4_000) + "\n</div>",
  "## Heading\n\ntext\n\n".repeat(8_000) +
    '<img src="x" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">bad</a>',
];

for (const [index, content] of cases.entries()) {
  const expected = document.createElement("div");
  expected.innerHTML = DOMPurify.sanitize(parseMarkdown(content), {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  });
  const actual = document.createElement("div");
  actual.innerHTML = renderMarkdown(content);
  assert.equal(actual.querySelector(".preview-error"), null, `case ${index}: rendered`);
  const sections = [...actual.querySelectorAll(":scope > .markdown-section")];
  if (index === 0) assert.equal(sections.length, 0, "small notes keep their tree");
  if (index === 2) assert.ok(sections.length > 1, "large flat documents are grouped");
  for (const section of sections) {
    assert.ok(section.childElementCount <= 64, "bounded section roots");
    section.replaceWith(...section.childNodes);
  }
  assert.equal(actual.innerHTML, expected.innerHTML, `case ${index}: exact sanitized tree`);
  assert.equal(
    actual.textContent,
    expected.textContent,
    `case ${index}: continuous selectable text`,
  );
}
for (const newline of ["\n", "\r\n"]) {
  const source = Array.from(
    { length: 1_106 },
    (_, i) => `const row${i} = { title: "<&script>", ready: true };`,
  ).join(newline);
  const actual = document.createElement("div");
  actual.innerHTML = renderCode(source, "source.ts");
  assert.ok(actual.querySelectorAll(".code-view-block").length > 1);
  assert.equal(actual.querySelector("script"), null);
  const expected = document.createElement("pre");
  expected.innerHTML = escapeHTML(source);
  assert.equal(actual.textContent, expected.textContent);
}
await window.happyDOM.close();
console.log(`Preview DOM: ${cases.length + 2} sanitization/tree fidelity cases passed`);
