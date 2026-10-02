/** Stop at the existing syntax boundary without allocating every line. */
export function exceedsHighlightLimit(content: string): boolean {
  if (content.length > 200_000) return true;
  let lines = 1;
  let offset = -1;
  while ((offset = content.indexOf("\n", offset + 1)) >= 0) {
    if (++lines > 2_000) return true;
  }
  return false;
}

/** Keep continuous text and selection intact while letting the webview skip offscreen layout. */
export function textBlocks(content: string, targetSize = 16_384): string[] {
  const blocks: string[] = [];
  let start = 0;
  while (start < content.length) {
    const newline = content.indexOf("\n", start + targetSize);
    const end = newline < 0 ? content.length : newline + 1;
    blocks.push(content.slice(start, end));
    start = end;
  }
  return blocks;
}

export function countText(content: string) {
  let lines = content.length ? 1 : 0;
  let words = 0;
  let inWord = false;
  for (let index = 0; index < content.length; index++) {
    const code = content.charCodeAt(index);
    if (code === 10) lines++;
    const whitespace =
      code === 32 || (code >= 9 && code <= 13) || (code > 127 && /\s/u.test(content[index]));
    if (!whitespace && !inWord) words++;
    inWord = !whitespace;
  }
  return { lines, words };
}

/** Count all results, retaining only the next position rather than an unbounded match array. */
export function findText(content: string, query: string, after: number, direction: 1 | -1 = 1) {
  if (!query) return { count: 0, index: 0, position: -1 };
  // Unicode case folding can change string length (for example İ). Match the
  // original source so editor positions always remain UTF-16 offsets.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  let count = 0;
  let first = -1;
  let position = -1;
  let index = 0;
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const offset = match.index;
    last = offset;
    if (first < 0) first = offset;
    if (
      (direction === 1 && position < 0 && offset >= after) ||
      (direction === -1 && offset < after)
    ) {
      position = offset;
      index = count;
    }
    count++;
  }
  if (direction === -1 && position < 0 && count) {
    position = last;
    index = count - 1;
  }
  return { count, index, position: position < 0 ? first : position };
}

/** Textarea and CodeMirror count CRLF as one editor character. Keep source intact. */
export function editorOffsetForSource(content: string, offset: number): number {
  const end = Math.max(0, Math.min(content.length, Math.trunc(offset)));
  let removed = 0;
  for (let index = 0; index < end; index++) {
    if (content.charCodeAt(index) === 13 && content.charCodeAt(index + 1) === 10) {
      removed++;
      index++;
    }
  }
  return end - removed;
}

export function sourceOffsetForEditor(content: string, offset: number): number {
  const end = Math.max(0, Math.trunc(offset));
  let source = 0;
  for (let editor = 0; editor < end && source < content.length; editor++) {
    source += content.charCodeAt(source) === 13 && content.charCodeAt(source + 1) === 10 ? 2 : 1;
  }
  return source;
}
