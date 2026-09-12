import { describe, expect, test } from "bun:test";

import { isRelativeMarkdownAsset, parseMarkdown, renderCode } from "../src/preview/render";

describe("bounded code rendering", () => {
  test("renders every supported code extension without runtime language loading", () => {
    const paths = [
      "sample.py",
      "sample.js",
      "sample.ts",
      "sample.tsx",
      "sample.go",
      "sample.rs",
      "sample.rb",
      "sample.lua",
      "sample.sh",
      "sample.json",
      "sample.yaml",
      "sample.xml",
      "sample.toml",
      "sample.ini",
      "sample.properties",
      "sample.html",
      "sample.css",
      "sample.scss",
      "sample.less",
      "sample.vue",
      "sample.svelte",
      "sample.sql",
      "sample.c",
      "sample.cpp",
      "sample.cs",
      "sample.java",
      "sample.kt",
      "sample.swift",
      "sample.dart",
      "sample.r",
      "sample.pl",
      "sample.php",
      "sample.ex",
      "sample.nim",
      "sample.ps1",
      "sample.bat",
      "sample.gradle",
      "sample.tf",
      "sample.hcl",
      "sample.zig",
      "sample.diff",
      "sample.patch",
    ];
    for (const path of paths) {
      const html = renderCode('const value = "safe";\n', path);
      expect(html).toStartWith("<pre");
      expect(html).toContain("safe");
      expect(html).not.toContain("<script>");
    }
  });

  test("falls back to escaped plain text beyond the syntax budget", () => {
    const html = renderCode(`<script>${"x\n".repeat(2_001)}</script>`, "large.ts");
    expect(html).toContain('class="plain-text-view"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("highlights unified diffs with addition and deletion roles", () => {
    const html = renderCode("-before\n+after\n", "changes.diff");
    expect(html).toContain("hljs-deletion");
    expect(html).toContain("hljs-addition");
  });
});

describe("modern Markdown rendering", () => {
  test("distinguishes local relative images from remote and embedded sources", () => {
    expect(isRelativeMarkdownAsset("./screenshots/markpad.png")).toBe(true);
    expect(isRelativeMarkdownAsset("../assets/hero image.webp?raw=1")).toBe(true);
    expect(isRelativeMarkdownAsset("https://example.com/hero.png")).toBe(false);
    expect(isRelativeMarkdownAsset("data:image/png;base64,AA==")).toBe(false);
    expect(isRelativeMarkdownAsset("/assets/hero.png")).toBe(false);
    expect(isRelativeMarkdownAsset("C:\\assets\\hero.png")).toBe(false);
    expect(isRelativeMarkdownAsset("#diagram")).toBe(false);
  });

  test("renders GFM tables, tasks, strike-through, autolinks, and fenced code", () => {
    const html = parseMarkdown(`~~old~~

- [x] done

| A | B |
| - | - |
| 1 | 2 |

https://example.com

\`\`\`typescript
const value = 1;
\`\`\``);
    expect(html).toContain("<del>old</del>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("hljs-keyword");
  });

  test("escapes fence language attributes and bounds long fenced highlighting", () => {
    const unsafe = parseMarkdown('```foo"onclick="alert(1)\n<script>unsafe</script>\n```');
    expect(unsafe).not.toContain('"onclick="');
    expect(unsafe).toContain("&lt;script&gt;");
    const large = parseMarkdown("```typescript\n" + "const x = 1;\n".repeat(2001) + "```");
    expect(large).toContain("const x = 1;");
    expect(large).not.toContain("hljs-keyword");
  });

  test("marks Mermaid fences for safe lazy rendering", () => {
    const html = parseMarkdown("```mermaid\nflowchart LR\nA --> B\n```");
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('data-mermaid-diagram="true"');
    expect(html).toContain("flowchart LR");
    expect(html).not.toContain("<svg");
  });

  test("keeps oversized Mermaid source visible instead of loading the renderer", () => {
    const html = parseMarkdown(`\`\`\`mermaid\n${"A --> B\n".repeat(7_000)}\`\`\``);
    expect(html).toContain("mermaid-error");
    expect(html).not.toContain("data-mermaid-diagram");
  });
});
