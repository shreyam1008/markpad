import { exceedsHighlightLimit } from "./text-blocks";

const BLOCK_LINES = 64;

/**
 * Contain layout, not document text. Highlighting must run on the whole source
 * first: independent chunks would break multiline comments, strings and tags.
 * The input is renderCode's escaped Highlight.js output, not arbitrary HTML.
 */
export function containHighlightedCode(html: string, content: string): string {
  if (exceedsHighlightLimit(content)) return html;
  const metrics: { lines: number; columns: number }[] = [];
  let lines = 0;
  let columns = 0;
  let widest = 0;
  for (let index = 0; index < content.length; index++) {
    const character = content.charCodeAt(index);
    // A ch estimate is exact for the existing monospace ASCII layout. Retain
    // the original layout for variable-width Unicode/control glyphs rather
    // than changing the horizontal scroll range as blocks enter the viewport.
    if (character > 126 || (character < 32 && ![9, 10, 13].includes(character))) return html;
    // HTML normalizes a bare CR to a newline, unlike the LF-aligned metrics.
    if (character === 13 && content.charCodeAt(index + 1) !== 10) return html;
    if (character === 10) {
      widest = Math.max(widest, columns);
      columns = 0;
      if (++lines === BLOCK_LINES) {
        metrics.push({ lines, columns: widest });
        lines = 0;
        widest = 0;
      }
    } else if (character === 9) {
      columns += 2 - (columns % 2); // The static code theme uses tab-size: 2.
    } else if (character !== 13) {
      columns++;
    }
  }
  if (columns || !content.endsWith("\n")) lines++;
  if (lines) metrics.push({ lines, columns: Math.max(widest, columns) });
  if (metrics.length <= 2) return html;

  const envelope = /^<pre><code class="hljs language-[\w-]*">/.exec(html);
  const ending = "</code></pre>";
  if (!envelope || !html.endsWith(ending)) return html;
  const body = html.slice(envelope[0].length, -ending.length);
  const stack: string[] = [];
  const blocks: string[] = [];
  let pieces: string[] = [];
  let blockLines = 0;
  let hasText = false;
  let consumed = 0;

  const finish = () => {
    const metric = metrics[blocks.length];
    if (!metric) return false;
    blocks.push(
      `<span class="code-view-block" style="contain-intrinsic-block-size:auto ${metric.lines}lh;contain-intrinsic-inline-size:auto ${metric.columns}ch">${pieces.join("")}${"</span>".repeat(stack.length)}</span>`,
    );
    pieces = [...stack];
    blockLines = 0;
    hasText = false;
    return true;
  };

  for (const token of body.matchAll(/<[^>]*>|[^<]+/g)) {
    if (token.index !== consumed) return html;
    const value = token[0];
    consumed += value.length;
    if (value.startsWith("<")) {
      if (/^<span class="[\w .:-]+">$/.test(value)) {
        if (stack.length >= 256) return html;
        stack.push(value);
      } else if (value === "</span>" && stack.length) {
        stack.pop();
      } else {
        // Unknown markup cannot be safely split. Never parse or reinterpret
        // escaped source as tags, and never add user-controlled attributes.
        return html;
      }
      pieces.push(value);
      continue;
    }
    let start = 0;
    for (let offset = value.indexOf("\n"); offset >= 0; offset = value.indexOf("\n", start)) {
      pieces.push(value.slice(start, offset + 1));
      hasText = true;
      start = offset + 1;
      if (++blockLines === BLOCK_LINES && !finish()) return html;
    }
    if (start < value.length) {
      pieces.push(value.slice(start));
      hasText = true;
    }
  }
  if (
    consumed !== body.length ||
    stack.length ||
    (hasText && !finish()) ||
    blocks.length !== metrics.length
  )
    return html;
  return envelope[0] + blocks.join("") + ending;
}
