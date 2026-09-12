export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Map reading progress between panes with different rendered heights. */
export function pairedScrollTop(source: ScrollMetrics, target: ScrollMetrics): number {
  const sourceRange = Math.max(0, source.scrollHeight - source.clientHeight);
  const targetRange = Math.max(0, target.scrollHeight - target.clientHeight);
  if (!sourceRange || !targetRange) return 0;
  return Math.min(1, Math.max(0, source.scrollTop / sourceRange)) * targetRange;
}
