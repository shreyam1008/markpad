import { describe, expect, it } from 'vitest'
import {
  dragHasAttachmentFile,
  formatImportedAssetsForInsertion,
  importedAssetForExistingVaultAsset
} from './editor-drops'

function transfer(items: Array<{ kind: string; type: string }>): DataTransfer {
  return { items } as unknown as DataTransfer
}

describe('editor drop helpers', () => {
  it('turns an existing vault asset into embed markdown', () => {
    expect(
      importedAssetForExistingVaultAsset({
        path: 'media/zennotes logo.png',
        name: 'zennotes logo.png',
        kind: 'image',
        siblingOrder: 0,
        size: 42,
        updatedAt: 1
      })
    ).toEqual({
      path: 'media/zennotes logo.png',
      name: 'zennotes logo.png',
      kind: 'image',
      markdown: '![[media/zennotes logo.png]]'
    })
  })

  it('keeps dropped media tight when inserting on an empty editor line', () => {
    expect(
      formatImportedAssetsForInsertion(
        [
          {
            path: 'media/zennotes logo.png',
            name: 'zennotes logo.png',
            kind: 'image',
            markdown: '![[media/zennotes logo.png]]'
          }
        ],
        '\n',
        ''
      )
    ).toBe('![[media/zennotes logo.png]]\n')
  })

  it('separates dropped media from surrounding prose without adding an extra trailing blank line', () => {
    expect(
      formatImportedAssetsForInsertion(
        [
          {
            path: 'media/zennotes logo.png',
            name: 'zennotes logo.png',
            kind: 'image',
            markdown: '![[media/zennotes logo.png]]'
          }
        ],
        't',
        ''
      )
    ).toBe('\n\n![[media/zennotes logo.png]]\n')
  })
})

describe('dragHasAttachmentFile', () => {
  it('is true for media + pdf file drags', () => {
    expect(dragHasAttachmentFile(transfer([{ kind: 'file', type: 'image/png' }]))).toBe(true)
    expect(dragHasAttachmentFile(transfer([{ kind: 'file', type: 'application/pdf' }]))).toBe(true)
    expect(dragHasAttachmentFile(transfer([{ kind: 'file', type: 'audio/mpeg' }]))).toBe(true)
    expect(dragHasAttachmentFile(transfer([{ kind: 'file', type: 'video/mp4' }]))).toBe(true)
  })

  it('is false for markdown / text / unknown-type drags', () => {
    expect(dragHasAttachmentFile(transfer([{ kind: 'file', type: 'text/markdown' }]))).toBe(false)
    expect(dragHasAttachmentFile(transfer([{ kind: 'file', type: 'text/plain' }]))).toBe(false)
    // macOS sometimes reports no MIME for a dragged .md file.
    expect(dragHasAttachmentFile(transfer([{ kind: 'file', type: '' }]))).toBe(false)
  })

  it('still flags an attachment when dragged alongside markdown', () => {
    expect(
      dragHasAttachmentFile(
        transfer([
          { kind: 'file', type: 'text/markdown' },
          { kind: 'file', type: 'image/jpeg' }
        ])
      )
    ).toBe(true)
  })

  it('ignores non-file items and null transfers', () => {
    expect(dragHasAttachmentFile(transfer([{ kind: 'string', type: 'image/png' }]))).toBe(false)
    expect(dragHasAttachmentFile(null)).toBe(false)
  })
})
