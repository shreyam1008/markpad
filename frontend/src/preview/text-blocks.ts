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
export function findText(content: string, query: string, after: number) {
  if (!query) return { count: 0, index: 0, position: -1 };
  const haystack = content.toLowerCase();
  const needle = query.toLowerCase();
  let count = 0;
  let first = -1;
  let position = -1;
  let index = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) >= 0) {
    if (first < 0) first = offset;
    if (position < 0 && offset >= after) {
      position = offset;
      index = count;
    }
    count++;
    offset += needle.length;
  }
  return { count, index, position: position < 0 ? first : position };
}
