// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storeState = vi.hoisted(() => ({
  current: {
    editorViewRef: null as null | { dom: HTMLElement; focus: () => void },
    vimMode: false,
    setFocusedPanel: vi.fn()
  }
}))

vi.mock('../store', () => ({
  useStore: {
    getState: () => storeState.current
  }
}))

vi.mock('@replit/codemirror-vim', () => ({
  Vim: {
    exitInsertMode: vi.fn()
  },
  getCM: vi.fn(() => null)
}))

import { focusEditorNormalMode } from './editor-focus'

describe('focusEditorNormalMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    storeState.current = {
      editorViewRef: null,
      vimMode: false,
      setFocusedPanel: vi.fn()
    }
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      return window.setTimeout(() => callback(performance.now()), 0)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('retries focus when the editor view appears after a palette closes', async () => {
    focusEditorNormalMode({ attempts: 3, delayMs: 5 })

    await vi.advanceTimersByTimeAsync(0)
    expect(storeState.current.setFocusedPanel).toHaveBeenCalledWith('editor')

    const dom = document.createElement('div')
    dom.tabIndex = -1
    document.body.appendChild(dom)
    const focus = vi.fn(() => dom.focus())
    storeState.current.editorViewRef = { dom, focus }

    await vi.advanceTimersByTimeAsync(5)

    expect(focus).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(dom)
  })
})
