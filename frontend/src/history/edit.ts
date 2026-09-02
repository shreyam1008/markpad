const LARGE_HISTORY_THRESHOLD = 256_000;
const LARGE_HISTORY_COALESCE_MS = 500;

/** Keep rapid textarea edits from retaining one full string per key. */
export function shouldCoalesceLargeEdit(
  valueLength: number,
  historyLength: number,
  previousAt: number,
  now: number,
): boolean {
  return (
    valueLength >= LARGE_HISTORY_THRESHOLD &&
    historyLength > 1 &&
    now - previousAt < LARGE_HISTORY_COALESCE_MS
  );
}
