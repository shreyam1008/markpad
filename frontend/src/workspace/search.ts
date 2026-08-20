import type { WorkspaceSearchResult } from "./types";

export interface HighlightParts {
  before: string;
  match: string;
  after: string;
}

export function splitSearchHighlight(
  value: string,
  matchStart: number,
  matchEnd: number,
): HighlightParts {
  const start = Math.max(0, Math.min(value.length, Math.trunc(matchStart)));
  const end = Math.max(start, Math.min(value.length, Math.trunc(matchEnd)));
  return {
    before: value.slice(0, start),
    match: value.slice(start, end),
    after: value.slice(end),
  };
}

export function searchResultKey(result: WorkspaceSearchResult): string {
  return `${result.path}\u0000${result.line}\u0000${result.column}`;
}

export function matchSelectionOffset(content: string, line: number, column: number): number {
  const targetLine = Math.max(1, Math.trunc(line));
  const lines = content.split("\n");
  const lineIndex = Math.min(targetLine - 1, lines.length - 1);
  let offset = 0;
  for (let index = 0; index < lineIndex; index++) {
    offset += lines[index].length + 1;
  }
  const lineText = lines[lineIndex] ?? "";
  return offset + Math.max(0, Math.min(lineText.length, Math.trunc(column)));
}
