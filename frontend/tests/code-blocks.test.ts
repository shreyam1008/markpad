import { describe, expect, test } from "bun:test";

import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";

import { containHighlightedCode } from "../src/preview/code-blocks";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("xml", xml);

const rendered = (text: string, language = "javascript") =>
  `<pre><code class="hljs language-${language}">${hljs.highlight(text, { language }).value}</code></pre>`;

// Compare the syntax scope of every encoded source run, ignoring only layout
// wrappers. Adjacent equal scopes merge, including reopened multiline spans.
function syntaxRuns(html: string) {
  const stack: string[] = [];
  const runs: { text: string; scope: string }[] = [];
  for (const token of html.matchAll(/<[^>]*>|[^<]+/g)) {
    const value = token[0];
    if (value.startsWith("<span")) {
      const scope = /class="([^"]+)"/.exec(value)?.[1] ?? "";
      stack.push(scope === "code-view-block" ? "" : scope);
    } else if (value === "</span>") {
      expect(stack.length).toBeGreaterThan(0);
      stack.pop();
    } else if (!value.startsWith("<")) {
      const scope = stack.filter(Boolean).join("/");
      const previous = runs.at(-1);
      if (previous?.scope === scope) previous.text += value;
      else runs.push({ text: value, scope });
    }
  }
  expect(stack).toEqual([]);
  return runs;
}

describe("contained whole-source highlighting", () => {
  test("bounds large code layout without altering text or syntax scopes", () => {
    const content = Array.from(
      { length: 1_100 },
      (_, index) =>
        `const row${index} = { id: ${index}, title: "A readable record", ready: true };`,
    ).join("\n");
    const original = rendered(content);
    const contained = containHighlightedCode(original, content);
    expect(contained.match(/class="code-view-block"/g)).toHaveLength(18);
    expect(contained).toContain("contain-intrinsic-block-size:auto 64lh");
    expect(syntaxRuns(contained)).toEqual(syntaxRuns(original));
    expect(containHighlightedCode(contained, content)).toBe(contained);
  });

  test("preserves comments, template interpolation and embedded markup across boundaries", () => {
    for (const [language, content] of [
      ["javascript", `/* heading\n${"comment\n".repeat(200)}*/\nconst value = true;`],
      ["javascript", "const value = `heading\n" + "template ${1 + 2}\n".repeat(200) + "`;\n"],
      ["xml", `<script>\n${"const value = true;\n".repeat(200)}</script>\n`],
      ["xml", `<!--\n${"comment\n".repeat(200)}-->\n<main title="safe">content</main>`],
    ]) {
      const original = rendered(content, language);
      const contained = containHighlightedCode(original, content);
      expect(contained).toContain('class="code-view-block"');
      expect(syntaxRuns(contained)).toEqual(syntaxRuns(original));
    }
  });

  test("retains CRLF, blank lines, final newline and tabs in continuous selectable text", () => {
    for (const content of [
      "const x = 1;\r\n".repeat(192),
      "\n".repeat(192),
      "\tconst value = 2;\n".repeat(193),
      "const value = 2;\n".repeat(192) + "last",
    ]) {
      const original = rendered(content);
      const contained = containHighlightedCode(original, content);
      expect(contained).toContain('class="code-view-block"');
      expect(contained.replace(/<[^>]*>/g, "")).toBe(original.replace(/<[^>]*>/g, ""));
      expect(syntaxRuns(contained)).toEqual(syntaxRuns(original));
    }
  });

  test("keeps bare carriage returns on the original layout while retaining CRLF blocks", () => {
    const lines = "const value = 1;\n".repeat(192);
    for (const content of [`${lines}left\rright`, `left\rright\n${lines}`, `${lines}\r`]) {
      const original = rendered(content);
      expect(containHighlightedCode(original, content)).toBe(original);
    }
    const crlf = lines.replaceAll("\n", "\r\n");
    const original = rendered(crlf);
    const contained = containHighlightedCode(original, crlf);
    expect(contained).toContain('class="code-view-block"');
    expect(syntaxRuns(contained)).toEqual(syntaxRuns(original));
  });

  test("retains escaping instead of turning source into executable markup", () => {
    const content = 'const source = "<img src=x onerror=alert(1)> & </span>";\n'.repeat(192);
    const original = rendered(content);
    const contained = containHighlightedCode(original, content);
    expect(contained).not.toContain("<img");
    expect(contained).toContain("&lt;img");
    expect(syntaxRuns(contained)).toEqual(syntaxRuns(original));
  });

  test("preserves original layout for small, over-budget and variable-width source", () => {
    for (const content of ["x\n".repeat(128), "x\n".repeat(2_001), "😀\n".repeat(200)]) {
      const original = rendered(content);
      expect(containHighlightedCode(original, content)).toBe(original);
    }
    expect(
      containHighlightedCode('<pre class="plain-text-view">plain</pre>', "x\n".repeat(200)),
    ).toBe('<pre class="plain-text-view">plain</pre>');
  });

  test("declines malformed span stacks instead of changing their structure", () => {
    const content = "line\n".repeat(200);
    for (const body of [
      `<span class="hljs-comment">${content}`,
      `${content}</span>`,
      `<span title="unexpected">${content}</span>`,
      `${content}<`,
    ]) {
      const html = `<pre><code class="hljs language-javascript">${body}</code></pre>`;
      expect(containHighlightedCode(html, content)).toBe(html);
    }
  });
});
