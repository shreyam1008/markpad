export const MAX_CONTENT_QUERY_LENGTH = 256;

const MAX_RESULTS = 500;
const SCAN_CHUNK_SIZE = 32_768;
const FUZZY_SCAN_CHUNK_SIZE = 4_096;
const SNIPPET_LENGTH = 160;
const WORD = /[\p{L}\p{N}\p{M}_]/u;
const ASCII_WORD = /^[A-Za-z0-9_]+$/;
const NON_ASCII = /[\u0080-\uffff]/;

export interface ContentSearchMatch {
  /** Selection offsets in the original buffer, in UTF-16 code units. */
  start: number;
  end: number;
  text: string;
  /** One-based line and UTF-16 column of the start of the selection. */
  line: number;
  column: number;
  snippet: string;
  highlightStart: number;
  highlightEnd: number;
  fuzzy: boolean;
}

export interface ContentSearchOptions {
  fuzzy?: boolean;
  limit?: number;
  signal?: AbortSignal;
}

export interface ContentSearchResult<T = ContentSearchMatch> {
  matches: T[];
  truncated: boolean;
  cancelled: boolean;
  queryTooLong: boolean;
}

export interface SearchableNote {
  id: string;
  title: string;
  content: string;
}

export interface OpenNoteSearchMatch extends ContentSearchMatch {
  noteId: string;
  noteTitle: string;
}

interface CompiledQuery {
  exact: RegExp;
  width: number;
  fuzzyNeedle: string[] | null;
  asciiNeedle: number[] | null;
}

function compileQuery(query: string, fuzzy: boolean): CompiledQuery | null {
  if (!query.trim() || query.length > MAX_CONTENT_QUERY_LENGTH) return null;
  const exact = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const letters = Array.from(query.toLowerCase());
  const fuzzyNeedle =
    fuzzy && letters.length >= 4 && letters.length <= 64 && /^[\p{L}\p{N}\p{M}_]+$/u.test(query)
      ? letters
      : null;
  return {
    exact,
    width: query.length,
    fuzzyNeedle,
    asciiNeedle:
      fuzzyNeedle && ASCII_WORD.test(query) ? letters.map((letter) => letter.charCodeAt(0)) : null,
  };
}

function resultLimit(limit: number | undefined, fallback: number): number {
  return limit === undefined || !Number.isFinite(limit)
    ? fallback
    : Math.max(1, Math.min(MAX_RESULTS, Math.floor(limit)));
}

function emptyResult<T>(query: string, signal?: AbortSignal): ContentSearchResult<T> {
  return {
    matches: [],
    truncated: false,
    cancelled: signal?.aborted ?? false,
    queryTooLong: query.length > MAX_CONTENT_QUERY_LENGTH,
  };
}

/** A single insertion, deletion, substitution, or adjacent transposition. */
function oneTypo(needle: string[], word: string[]): boolean {
  if (Math.abs(needle.length - word.length) > 1) return false;
  let index = 0;
  while (index < needle.length && index < word.length && needle[index] === word[index]) index++;
  if (index === needle.length && index === word.length) return false;
  let left = index;
  let right = index;
  if (needle.length > word.length) left++;
  else if (word.length > needle.length) right++;
  else if (needle[index] === word[index + 1] && needle[index + 1] === word[index]) {
    left += 2;
    right += 2;
  } else {
    left++;
    right++;
  }
  while (left < needle.length && right < word.length) {
    if (needle[left++] !== word[right++]) return false;
  }
  return left === needle.length && right === word.length;
}

function asciiCode(word: string, index: number): number {
  const code = word.charCodeAt(index);
  return code >= 65 && code <= 90 ? code + 32 : code;
}

function oneAsciiTypo(needle: number[], word: string): boolean {
  if (Math.abs(needle.length - word.length) > 1) return false;
  let index = 0;
  while (index < needle.length && index < word.length && needle[index] === asciiCode(word, index))
    index++;
  if (index === needle.length && index === word.length) return false;
  let left = index;
  let right = index;
  if (needle.length > word.length) left++;
  else if (word.length > needle.length) right++;
  else if (
    needle[index] === asciiCode(word, index + 1) &&
    needle[index + 1] === asciiCode(word, index)
  ) {
    left += 2;
    right += 2;
  } else {
    left++;
    right++;
  }
  while (left < needle.length && right < word.length) {
    if (needle[left++] !== asciiCode(word, right++)) return false;
  }
  return left === needle.length && right === word.length;
}

function safeBoundary(content: string, index: number): number {
  const previous = content.charCodeAt(index - 1);
  const next = content.charCodeAt(index);
  return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
    ? index + 1
    : index;
}

function makeMatch(
  content: string,
  start: number,
  end: number,
  line: number,
  lineStart: number,
  fuzzy: boolean,
): ContentSearchMatch {
  const snippetStart = safeBoundary(content, Math.max(0, start - 48));
  const snippetEnd = Math.min(
    content.length,
    safeBoundary(content, Math.max(snippetStart + SNIPPET_LENGTH, end + 24)),
  );
  const prefix = snippetStart > 0 ? "…" : "";
  const suffix = snippetEnd < content.length ? "…" : "";
  // Replace each control code unit separately so the highlight offsets remain stable.
  const text = content.slice(snippetStart, snippetEnd).replace(/[\r\n\t]/g, " ");
  return {
    start,
    end,
    text: content.slice(start, end),
    line,
    column: start - lineStart + 1,
    snippet: prefix + text + suffix,
    highlightStart: prefix.length + start - snippetStart,
    highlightEnd: prefix.length + Math.min(end, snippetEnd) - snippetStart,
    fuzzy,
  };
}

/** null marks a bounded scan boundary, including a chunk with no matches. */
function* scanNote(
  content: string,
  query: CompiledQuery,
  fuzzy: boolean,
): Generator<ContentSearchMatch | null> {
  let line = 1;
  let lineStart = 0;
  let locationCursor = 0;
  let nextExactStart = 0;
  const words = /[\p{L}\p{N}\p{M}_]+/gu;
  const asciiWords = /[A-Za-z0-9_]+/g;
  const lineBreaks = /[\r\n]/g;
  const advanceLocation = (end: number) => {
    const block = content.slice(locationCursor, end);
    lineBreaks.lastIndex = 0;
    let found: RegExpExecArray | null;
    while ((found = lineBreaks.exec(block)) !== null) {
      const offset = locationCursor + found.index;
      if (block.charCodeAt(found.index) === 13 || content.charCodeAt(offset - 1) !== 13) {
        line++;
      }
      lineStart = offset + 1;
    }
    locationCursor = end;
  };

  for (let chunkStart = 0; chunkStart < content.length;) {
    const chunkEnd = Math.min(
      content.length,
      safeBoundary(content, chunkStart + (fuzzy ? FUZZY_SCAN_CHUNK_SIZE : SCAN_CHUNK_SIZE)),
    );
    // Exact matches can span chunks; fuzzy tokens are at most 65 Unicode characters.
    const overlap = fuzzy ? 132 : query.width;
    const windowEnd = Math.min(content.length, safeBoundary(content, chunkEnd + overlap));
    const window = content.slice(chunkStart, windowEnd);
    // ASCII blocks use the equivalent cheaper tokenizer; other scripts retain Unicode rules.
    const expression = fuzzy ? (NON_ASCII.test(window) ? words : asciiWords) : query.exact;
    expression.lastIndex = fuzzy ? 0 : Math.max(0, nextExactStart - chunkStart);
    let found: RegExpExecArray | null;
    while ((found = expression.exec(window)) !== null) {
      const start = chunkStart + found.index;
      if (start >= chunkEnd) break;
      const end = start + found[0].length;
      if (fuzzy) {
        const needle = query.fuzzyNeedle;
        if (
          !needle ||
          found[0].length < needle.length - 1 ||
          found[0].length > (needle.length + 1) * 2 ||
          !(query.asciiNeedle && ASCII_WORD.test(found[0])
            ? oneAsciiTypo(query.asciiNeedle, found[0])
            : oneTypo(needle, Array.from(found[0].toLowerCase())))
        ) {
          continue;
        }
        // Do not treat a chunk's partial token as a word, or duplicate an exact substring.
        if (
          (found.index === 0 &&
            start > 0 &&
            /[\p{L}\p{N}\p{M}_]$/u.test(content.slice(Math.max(0, start - 2), start))) ||
          (end === windowEnd && WORD.test(String.fromCodePoint(content.codePointAt(end) ?? 32)))
        ) {
          continue;
        }
        query.exact.lastIndex = 0;
        if (query.exact.test(found[0])) continue;
      } else {
        nextExactStart = end;
      }
      while (locationCursor < start) {
        // Compute source locations only for results, yielding through a distant prefix.
        advanceLocation(Math.min(start, locationCursor + SCAN_CHUNK_SIZE));
        yield null;
      }
      yield makeMatch(content, start, end, line, lineStart, fuzzy);
    }
    chunkStart = chunkEnd;
    yield null;
  }
}

export function searchNoteContent(
  content: string,
  query: string,
  options: ContentSearchOptions = {},
): ContentSearchResult {
  const result = emptyResult<ContentSearchMatch>(query, options.signal);
  const compiled = compileQuery(query, options.fuzzy ?? false);
  if (!compiled || result.cancelled) return result;
  const limit = resultLimit(options.limit, 200);
  for (const fuzzy of compiled.fuzzyNeedle ? [false, true] : [false]) {
    for (const match of scanNote(content, compiled, fuzzy)) {
      if (options.signal?.aborted) return { ...result, cancelled: true };
      if (!match) continue;
      if (result.matches.length === limit) return { ...result, truncated: true };
      result.matches.push(match);
    }
  }
  return result;
}

/** Search only the supplied live buffers; no disk reads, indexes, or persisted cache. */
export async function searchOpenNotes(
  notes: readonly SearchableNote[],
  query: string,
  options: ContentSearchOptions = {},
): Promise<ContentSearchResult<OpenNoteSearchMatch>> {
  const result = emptyResult<OpenNoteSearchMatch>(query, options.signal);
  const compiled = compileQuery(query, options.fuzzy ?? false);
  if (!compiled || result.cancelled) return result;
  const limit = resultLimit(options.limit, 300);
  let lastYield = performance.now();
  for (const fuzzy of compiled.fuzzyNeedle ? [false, true] : [false]) {
    for (const note of notes) {
      if (options.signal?.aborted) return { ...result, cancelled: true };
      for (const match of scanNote(note.content, compiled, fuzzy)) {
        if (options.signal?.aborted) return { ...result, cancelled: true };
        if (match) {
          if (result.matches.length === limit) return { ...result, truncated: true };
          result.matches.push({ ...match, noteId: note.id, noteTitle: note.title });
        }
        if (performance.now() - lastYield >= 8) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          lastYield = performance.now();
        }
      }
    }
  }
  return { ...result, cancelled: options.signal?.aborted ?? false };
}
