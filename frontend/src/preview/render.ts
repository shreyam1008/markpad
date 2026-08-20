import DOMPurify from "dompurify";
import hljs from "highlight.js";

import "highlight.js/styles/github.css";
import { marked, type Tokens } from "marked";

import { fileExtension } from "../workspace/documents";

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
  const value =
    token.text.length <= 200_000 && hljs.getLanguage(language)
      ? hljs.highlight(token.text, { language }).value
      : escapeHTML(token.text);
  const languageClass = language ? ` class="hljs language-${language}"` : ' class="hljs"';
  return `<pre><code${languageClass}>${value}</code></pre>\n`;
};

marked.setOptions({ renderer, gfm: true, breaks: false });

export function renderMarkdown(content: string): string {
  try {
    return DOMPurify.sanitize(marked.parse(content) as string, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["target", "rel"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `<div class="preview-error"><strong>Preview unavailable</strong><span>${escapeHTML(message)}</span></div>`;
  }
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
    svelte: "xml",
    vue: "xml",
  };
  return aliases[extension] ?? extension;
}
