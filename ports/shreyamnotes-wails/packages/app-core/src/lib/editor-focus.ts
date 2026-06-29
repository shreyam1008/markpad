import { useStore } from '../store'

let vimModulePromise: Promise<typeof import('@replit/codemirror-vim')> | null = null

function loadVimModule(): Promise<typeof import('@replit/codemirror-vim')> {
  vimModulePromise ??= import('@replit/codemirror-vim')
  return vimModulePromise
}

/**
 * Return focus to the active editor pane, dropping out of vim insert
 * mode if applicable. Palette selections can swap tabs before the new
 * editor view has mounted, so focus is retried briefly instead of
 * falling through to sidebar keyboard navigation.
 */
export function focusEditorNormalMode(
  options: { attempts?: number; delayMs?: number } = {}
): void {
  const attempts = Math.max(1, options.attempts ?? 4)
  const delayMs = Math.max(0, options.delayMs ?? 16)

  const containsFocus = (
    view: NonNullable<ReturnType<typeof useStore.getState>['editorViewRef']>
  ): boolean => {
    if (typeof document === 'undefined') return true
    const active = document.activeElement
    return !!active && (active === view.dom || view.dom.contains(active))
  }

  const scheduleRetry = (remaining: number): void => {
    if (remaining <= 1) return
    window.setTimeout(() => run(remaining - 1), delayMs)
  }

  const run = (remaining: number): void => {
    const state = useStore.getState()
    const view = state.editorViewRef
    state.setFocusedPanel('editor')
    if (!view) {
      scheduleRetry(remaining)
      return
    }
    view.focus()
    if (state.vimMode) {
      void loadVimModule().then(({ Vim, getCM }) => {
        const cm = getCM(view)
        if (cm?.state.vim?.insertMode) {
          Vim.exitInsertMode(cm as Parameters<typeof Vim.exitInsertMode>[0], true)
        }
      })
    }
    if (!containsFocus(view)) scheduleRetry(remaining)
  }

  requestAnimationFrame(() => run(attempts))
}
