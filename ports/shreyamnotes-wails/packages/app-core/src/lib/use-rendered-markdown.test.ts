import { describe, expect, it } from 'vitest'
import { resolveSettledMarkdownSnapshot } from './use-rendered-markdown'

describe('resolveSettledMarkdownSnapshot', () => {
  it('uses current markdown immediately when the reset key changes', () => {
    expect(
      resolveSettledMarkdownSnapshot('next note', 'note-b', {
        key: 'note-a',
        markdown: 'previous note'
      })
    ).toEqual({
      settledMarkdown: 'next note',
      isStale: false
    })
  })

  it('keeps stale markdown only for edits within the same reset key', () => {
    expect(
      resolveSettledMarkdownSnapshot('edited body', 'note-a', {
        key: 'note-a',
        markdown: 'old body'
      })
    ).toEqual({
      settledMarkdown: 'old body',
      isStale: true
    })
  })
})
