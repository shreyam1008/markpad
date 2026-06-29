import type { LineNumberMode } from '../store'
import {
  DEFAULT_THEME_ID,
  THEMES,
  resolveAuto,
  type ThemeFamily,
  type ThemeMode
} from '../lib/themes'

export const FLOATING_PREFS_KEY = 'zen:prefs:v2'

export interface FloatingPrefs {
  vimMode: boolean
  vimInsertEscape: string
  livePreview: boolean
  themeId: string
  themeFamily: ThemeFamily
  themeMode: ThemeMode
  editorFontSize: number
  editorLineHeight: number
  lineNumberMode: LineNumberMode
  wordWrap: boolean
  interfaceFont: string | null
  textFont: string | null
  monoFont: string | null
}

export function loadFloatingPrefs(): FloatingPrefs {
  const fallback: FloatingPrefs = {
    vimMode: true,
    vimInsertEscape: '',
    livePreview: true,
    themeId: DEFAULT_THEME_ID,
    themeFamily: 'gruvbox',
    themeMode: 'dark',
    editorFontSize: 16,
    editorLineHeight: 1.7,
    lineNumberMode: 'off',
    wordWrap: true,
    interfaceFont: null,
    textFont: null,
    monoFont: null
  }
  try {
    const raw = localStorage.getItem(FLOATING_PREFS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<FloatingPrefs>
    const lineNumberMode: LineNumberMode =
      parsed.lineNumberMode === 'absolute' ||
      parsed.lineNumberMode === 'relative' ||
      parsed.lineNumberMode === 'off'
        ? parsed.lineNumberMode
        : fallback.lineNumberMode
    return {
      ...fallback,
      ...parsed,
      themeFamily: (parsed.themeFamily as ThemeFamily) ?? fallback.themeFamily,
      themeMode: (parsed.themeMode as ThemeMode) ?? fallback.themeMode,
      lineNumberMode
    }
  } catch {
    return fallback
  }
}

export function applyTheme(prefs: FloatingPrefs): void {
  const html = document.documentElement
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  let id = prefs.themeId
  if (prefs.themeMode === 'auto') {
    id = resolveAuto(prefs.themeFamily, mql.matches, prefs.themeId)
  }
  if (!THEMES.some((t) => t.id === id)) id = DEFAULT_THEME_ID
  html.dataset.theme = id
  html.style.setProperty('--z-editor-font-size', `${prefs.editorFontSize}px`)
  html.style.setProperty('--z-editor-line-height', String(prefs.editorLineHeight))
  const setFont = (name: string, value: string | null, fallback: string): void => {
    if (value) html.style.setProperty(name, `"${value}", ${fallback}`)
    else html.style.removeProperty(name)
  }
  setFont(
    '--z-interface-font',
    prefs.interfaceFont,
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif'
  )
  setFont(
    '--z-text-font',
    prefs.textFont,
    '"SF Mono", "SFMono-Regular", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace'
  )
  setFont(
    '--z-mono-font',
    prefs.monoFont,
    '"SF Mono", "SFMono-Regular", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace'
  )
  html.setAttribute('data-opaque', '')
}
