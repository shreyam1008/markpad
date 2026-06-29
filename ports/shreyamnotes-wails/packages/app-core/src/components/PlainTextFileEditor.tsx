import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExternalFileContent } from '@shared/ipc'
import { applyTheme, loadFloatingPrefs } from './floating-window-prefs'
import { CloseIcon, InboxIcon } from './icons'

const SAVE_DEBOUNCE_MS = 350

function titleFromName(name: string): string {
  return name || 'Untitled'
}

export function PlainTextFileEditor({
  initialContent
}: {
  initialContent: ExternalFileContent
}): JSX.Element {
  const prefs = useMemo(() => loadFloatingPrefs(), [])
  const [dirty, setDirty] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const bodyRef = useRef(initialContent.body)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const title = useMemo(() => titleFromName(initialContent.name), [initialContent.name])
  const canMoveToVault = initialContent.kind === 'markdown'

  useEffect(() => {
    applyTheme(prefs)
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    if (prefs.themeMode === 'auto') {
      const onChange = (): void => applyTheme(prefs)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    return undefined
  }, [prefs])

  useEffect(() => {
    document.title = title
  }, [title])

  useEffect(() => {
    textAreaRef.current?.focus()
  }, [])

  const persist = useCallback(async (body: string) => {
    try {
      await window.zen.writeExternalFile(body)
      if (bodyRef.current === body) setDirty(false)
    } catch (err) {
      console.error('writeExternalFile failed', err)
    }
  }, [])

  const flushSave = useCallback((): void => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    void persist(bodyRef.current)
  }, [persist])

  const scheduleSave = useCallback((): void => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void persist(bodyRef.current)
    }, SAVE_DEBOUNCE_MS)
  }, [persist])

  useEffect(() => {
    window.addEventListener('beforeunload', flushSave)
    return () => window.removeEventListener('beforeunload', flushSave)
  }, [flushSave])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        flushSave()
      } else if (key === 'w') {
        event.preventDefault()
        flushSave()
        window.zen.windowClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flushSave])

  const moveToVault = useCallback(async () => {
    if (moving) return
    setMoving(true)
    setMoveError(null)
    try {
      flushSave()
      await window.zen.moveExternalFileToVault()
    } catch (err) {
      setMoving(false)
      setMoveError(err instanceof Error ? err.message : 'Could not move this file into a vault.')
    }
  }, [flushSave, moving])

  const onInput = useCallback(
    (event: React.FormEvent<HTMLTextAreaElement>) => {
      bodyRef.current = event.currentTarget.value
      setDirty(true)
      setMoveError(null)
      scheduleSave()
    },
    [scheduleSave]
  )

  return (
    <div className="flex h-screen w-screen flex-col bg-paper-100 text-ink-900">
      <header
        className="glass-header flex h-12 shrink-0 items-center justify-between gap-2 border-b border-paper-300/70 px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-16">
          <span className="truncate text-sm font-semibold text-ink-900">{title}</span>
          {dirty && (
            <span
              aria-label="Unsaved changes"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/80"
            />
          )}
          <span className="truncate text-xs text-ink-400">
            {initialContent.kind === 'code' ? 'Code file' : 'Plain text'}
          </span>
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {canMoveToVault && (
            <button
              type="button"
              onClick={moveToVault}
              disabled={moving}
              title="Move this file into your vault"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-paper-200 hover:text-ink-900 disabled:opacity-50"
            >
              <InboxIcon width={13} height={13} />
              {moving ? 'Moving...' : 'Move to Vault'}
            </button>
          )}
          <button
            type="button"
            title="Close window"
            onClick={() => {
              flushSave()
              window.zen.windowClose()
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-500 hover:bg-paper-200 hover:text-ink-900"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      </header>

      {moveError && (
        <div className="shrink-0 border-b border-paper-300/70 bg-rose-500/10 px-4 py-1.5 text-xs text-rose-600">
          {moveError}
        </div>
      )}

      <textarea
        ref={textAreaRef}
        defaultValue={initialContent.body}
        spellCheck={false}
        onInput={onInput}
        className={[
          'min-h-0 flex-1 resize-none border-0 bg-paper-50 px-5 py-4 font-mono text-[var(--z-editor-font-size)] leading-[var(--z-editor-line-height)] text-ink-900 outline-none',
          prefs.wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-auto'
        ].join(' ')}
      />
    </div>
  )
}
