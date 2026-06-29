// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { isClipboardImageFile, pastedImageInputFromFile } from './editor-paste-images'

describe('editor paste images', () => {
  it('recognizes clipboard image files by MIME type or image extension', () => {
    expect(isClipboardImageFile(new File(['x'], 'clip', { type: 'image/png' }))).toBe(true)
    expect(isClipboardImageFile(new File(['x'], 'Screenshot.webp', { type: '' }))).toBe(true)
    expect(isClipboardImageFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBe(false)
  })

  it('converts a pasted image file into a bridge payload', async () => {
    const file = new File([Uint8Array.from([1, 2, 3])], 'clip.png', { type: 'image/png' })

    const input = await pastedImageInputFromFile(file)

    expect(input.mimeType).toBe('image/png')
    expect(input.suggestedName).toBe('clip.png')
    expect([...new Uint8Array(input.data)]).toEqual([1, 2, 3])
  })
})
