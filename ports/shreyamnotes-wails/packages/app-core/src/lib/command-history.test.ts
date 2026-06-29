// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { loadRecentCommandIds, recordCommandUse } from './command-history'

afterEach(() => {
  window.localStorage.clear()
})

describe('command-history', () => {
  it('returns an empty list when nothing has been recorded', () => {
    expect(loadRecentCommandIds()).toEqual([])
  })

  it('puts the most recently used command first', () => {
    recordCommandUse('a')
    recordCommandUse('b')
    expect(loadRecentCommandIds()).toEqual(['b', 'a'])
  })

  it('dedupes — re-using a command moves it to the front without duplicating', () => {
    recordCommandUse('a')
    recordCommandUse('b')
    recordCommandUse('a')
    expect(loadRecentCommandIds()).toEqual(['a', 'b'])
  })

  it('caps the stored backlog', () => {
    for (let i = 0; i < 30; i++) recordCommandUse(`cmd-${i}`)
    const ids = loadRecentCommandIds()
    expect(ids.length).toBeLessThanOrEqual(16)
    expect(ids[0]).toBe('cmd-29')
  })

  it('ignores malformed persisted data', () => {
    window.localStorage.setItem('zen:command-history:v1', '{"not":"an array"}')
    expect(loadRecentCommandIds()).toEqual([])
  })
})
