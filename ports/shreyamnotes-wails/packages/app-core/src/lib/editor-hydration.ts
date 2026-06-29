export interface EditorHydrationState {
  path: string
  ready: boolean
}

export function shouldDeferEditorHydration(
  showEditor: boolean,
  mode: string,
  bodyLength: number,
  threshold: number
): boolean {
  return showEditor && mode !== 'preview' && bodyLength >= threshold
}

export function isEditorReadyForContent(
  hasContent: boolean,
  showEditor: boolean,
  shouldDefer: boolean,
  contentPath: string | null,
  hydration: EditorHydrationState | null
): boolean {
  return !hasContent ||
    !showEditor ||
    !shouldDefer ||
    (hydration?.path === contentPath && hydration.ready)
}
