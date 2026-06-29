export const SIDEBAR_POINTER_SCROLL_TARGET_MS = 1_200

export interface SidebarScrollAnchorInput {
  scrollTop: number
  anchorTop: number
  nextAnchorTop: number
  scrollHeight: number
  clientHeight: number
}

export function getScrollTopForPreservedSidebarAnchor({
  scrollTop,
  anchorTop,
  nextAnchorTop,
  scrollHeight,
  clientHeight
}: SidebarScrollAnchorInput): number {
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
  const nextScrollTop = Math.max(0, scrollTop + nextAnchorTop - anchorTop)
  return Math.min(maxScrollTop, nextScrollTop)
}

export function isRecentSidebarPointerInteraction(
  lastPointerAt: number,
  now: number,
  windowMs = SIDEBAR_POINTER_SCROLL_TARGET_MS
): boolean {
  if (!Number.isFinite(lastPointerAt) || lastPointerAt <= 0) return false
  if (!Number.isFinite(now) || now < lastPointerAt) return false
  return now - lastPointerAt <= windowMs
}
