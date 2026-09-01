export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
  beforeLine?: number;
  afterLine?: number;
}

export interface DiffSummary {
  additions: number;
  deletions: number;
}

const MAX_DIFF_ROWS = 1_500;
const MAX_MATRIX_CELLS = 250_000;

function tooLarge(): DiffLine[] {
  return [{ kind: "ctx", text: "Diff is too large to display safely." }];
}

function alignedDiff(before: string[], after: string[]): DiffLine[] {
  const rows: DiffLine[] = [];
  const limit = Math.max(before.length, after.length);
  for (let index = 0; index < limit; index++) {
    if (before[index] === after[index]) {
      rows.push({
        kind: "ctx",
        text: before[index] ?? "",
        beforeLine: index + 1,
        afterLine: index + 1,
      });
    } else {
      if (before[index] !== undefined) {
        rows.push({ kind: "del", text: before[index], beforeLine: index + 1 });
      }
      if (after[index] !== undefined) {
        rows.push({ kind: "add", text: after[index], afterLine: index + 1 });
      }
    }
    if (rows.length > MAX_DIFF_ROWS) return tooLarge();
  }
  return rows;
}

export function diffLines(current: string, snapshot: string): DiffLine[] {
  const before = snapshot.split("\n");
  const after = current.split("\n");
  if (before.length && after.length > Math.floor(MAX_MATRIX_CELLS / before.length)) {
    return alignedDiff(before, after);
  }

  const width = after.length + 1;
  const table = new Uint16Array((before.length + 1) * width);
  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex--) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex--) {
      const cell = beforeIndex * width + afterIndex;
      table[cell] =
        before[beforeIndex] === after[afterIndex]
          ? table[(beforeIndex + 1) * width + afterIndex + 1] + 1
          : Math.max(
              table[(beforeIndex + 1) * width + afterIndex],
              table[beforeIndex * width + afterIndex + 1],
            );
    }
  }

  const rows: DiffLine[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length || afterIndex < after.length) {
    if (
      beforeIndex < before.length &&
      afterIndex < after.length &&
      before[beforeIndex] === after[afterIndex]
    ) {
      rows.push({
        kind: "ctx",
        text: before[beforeIndex],
        beforeLine: beforeIndex + 1,
        afterLine: afterIndex + 1,
      });
      beforeIndex++;
      afterIndex++;
    } else if (
      beforeIndex < before.length &&
      (afterIndex >= after.length ||
        table[(beforeIndex + 1) * width + afterIndex] >=
          table[beforeIndex * width + afterIndex + 1])
    ) {
      rows.push({ kind: "del", text: before[beforeIndex], beforeLine: beforeIndex + 1 });
      beforeIndex++;
    } else {
      rows.push({ kind: "add", text: after[afterIndex], afterLine: afterIndex + 1 });
      afterIndex++;
    }
    if (rows.length > MAX_DIFF_ROWS) return tooLarge();
  }
  return rows;
}

export function summarizeDiff(lines: DiffLine[]): DiffSummary {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.kind === "add") additions++;
    if (line.kind === "del") deletions++;
  }
  return { additions, deletions };
}
