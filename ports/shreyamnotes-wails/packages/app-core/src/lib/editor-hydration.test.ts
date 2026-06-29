import { describe, expect, it } from 'vitest'
import {
  isEditorReadyForContent,
  shouldDeferEditorHydration
} from './editor-hydration'

describe('editor hydration helpers', () => {
  it('keeps normal-sized note switches mounted without waiting for hydration state', () => {
    const shouldDefer = shouldDeferEditorHydration(true, 'split', 2_000, 120_000)

    expect(shouldDefer).toBe(false)
    expect(
      isEditorReadyForContent(true, true, shouldDefer, 'next.md', {
        path: 'previous.md',
        ready: true
      })
    ).toBe(true)
  })

  it('waits for matching hydration state only when editor hydration is deferred', () => {
    expect(shouldDeferEditorHydration(true, 'split', 120_000, 120_000)).toBe(true)
    expect(
      isEditorReadyForContent(true, true, true, 'large.md', {
        path: 'previous.md',
        ready: true
      })
    ).toBe(false)
    expect(
      isEditorReadyForContent(true, true, true, 'large.md', {
        path: 'large.md',
        ready: true
      })
    ).toBe(true)
  })
})
