import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cmake from "highlight.js/lib/languages/cmake";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import dart from "highlight.js/lib/languages/dart";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import dos from "highlight.js/lib/languages/dos";
import elixir from "highlight.js/lib/languages/elixir";
import go from "highlight.js/lib/languages/go";
import gradle from "highlight.js/lib/languages/gradle";
import groovy from "highlight.js/lib/languages/groovy";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import less from "highlight.js/lib/languages/less";
import lua from "highlight.js/lib/languages/lua";
import markdown from "highlight.js/lib/languages/markdown";
import nim from "highlight.js/lib/languages/nim";
import perl from "highlight.js/lib/languages/perl";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import properties from "highlight.js/lib/languages/properties";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { marked, type Tokens } from "marked";

import { fileExtension } from "../workspace/documents";

for (const [name, grammar] of [
  ["bash", bash],
  ["c", c],
  ["cmake", cmake],
  ["cpp", cpp],
  ["csharp", csharp],
  ["css", css],
  ["dart", dart],
  ["dockerfile", dockerfile],
  ["dos", dos],
  ["diff", diff],
  ["elixir", elixir],
  ["go", go],
  ["gradle", gradle],
  ["groovy", groovy],
  ["ini", ini],
  ["java", java],
  ["javascript", javascript],
  ["json", json],
  ["kotlin", kotlin],
  ["less", less],
  ["lua", lua],
  ["markdown", markdown],
  ["nim", nim],
  ["perl", perl],
  ["php", php],
  ["plaintext", plaintext],
  ["powershell", powershell],
  ["properties", properties],
  ["python", python],
  ["r", r],
  ["ruby", ruby],
  ["rust", rust],
  ["scss", scss],
  ["sql", sql],
  ["swift", swift],
  ["typescript", typescript],
  ["xml", xml],
  ["yaml", yaml],
] as const) {
  hljs.registerLanguage(name, grammar);
}

const renderer = new marked.Renderer();

renderer.heading = function (token: Tokens.Heading) {
  const body = this.parser.parseInline(token.tokens);
  const id = token.text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `<h${token.depth} id="${id}">${body}</h${token.depth}>\n`;
};

renderer.code = function (token: Tokens.Code) {
  const language = token.lang?.trim().split(/\s+/)[0] ?? "";
  if (language === "mermaid") {
    if (token.text.length > 50_000) {
      return `<pre class="mermaid mermaid-error" aria-label="Mermaid diagram is too large">${escapeHTML(token.text)}</pre>\n`;
    }
    return `<pre class="mermaid" data-mermaid-diagram="true">${escapeHTML(token.text)}</pre>\n`;
  }
  const value =
    token.text.length <= 200_000 && hljs.getLanguage(language)
      ? hljs.highlight(token.text, { language }).value
      : escapeHTML(token.text);
  const languageClass = language ? ` class="hljs language-${language}"` : ' class="hljs"';
  const languageLabel = language
    ? ` data-language="${escapeHTML(language.toLocaleUpperCase())}"`
    : "";
  return `<pre${languageLabel}><code${languageClass}>${value}</code></pre>\n`;
};

marked.setOptions({ renderer, gfm: true, breaks: false });

export function parseMarkdown(content: string): string {
  return marked.parse(content) as string;
}

export function renderMarkdown(content: string): string {
  try {
    return DOMPurify.sanitize(parseMarkdown(content), {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["target", "rel"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `<div class="preview-error"><strong>Preview unavailable</strong><span>${escapeHTML(message)}</span></div>`;
  }
}

export function isRelativeMarkdownAsset(source: string): boolean {
  const value = source.trim();
  return (
    Boolean(value) &&
    !value.startsWith("#") &&
    !value.startsWith("/") &&
    !value.startsWith("\\") &&
    !value.startsWith("//") &&
    !/^[a-z][a-z\d+.-]*:/i.test(value)
  );
}

export function renderCode(content: string, path: string): string {
  const language = languageForPath(path);
  if (content.length > 200_000 || content.split("\n").length > 2_000) {
    return `<pre class="plain-text-view">${escapeHTML(content)}</pre>`;
  }
  try {
    const value = hljs.getLanguage(language)
      ? hljs.highlight(content, { language }).value
      : escapeHTML(content);
    return `<pre><code class="hljs language-${language}">${value}</code></pre>`;
  } catch {
    return `<pre class="plain-text-view">${escapeHTML(content)}</pre>`;
  }
}

export function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function languageForPath(path: string): string {
  const extension = fileExtension(path);
  const aliases: Record<string, string> = {
    py: "python",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    rs: "rust",
    rb: "ruby",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "bash",
    yml: "yaml",
    htm: "html",
    cfg: "ini",
    conf: "ini",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    kt: "kotlin",
    ex: "elixir",
    exs: "elixir",
    pl: "perl",
    ps1: "powershell",
    bat: "dos",
    cmd: "dos",
    tf: "hcl",
    gradle: "groovy",
    toml: "ini",
    properties: "properties",
    env: "properties",
    editorconfig: "ini",
    gitignore: "plaintext",
    dockerfile: "dockerfile",
    diff: "diff",
    patch: "diff",
    cmake: "cmake",
    hcl: "plaintext",
    zig: "plaintext",
    svelte: "xml",
    vue: "xml",
  };
  return aliases[extension] ?? extension;
}
