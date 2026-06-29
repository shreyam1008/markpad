import { describe, expect, it, vi } from 'vitest'
import {
  installMarkdownFileDropHandler,
  isOsFileDrag,
  markdownFilesFromDrop
} from './markdown-file-drop'

function fileTransfer(files: Array<{ name: string }>, types: string[] = ['Files']): DataTransfer {
  return {
    types,
    files: files as unknown as FileList,
    dropEffect: 'none'
  } as unknown as DataTransfer
}

describe('isOsFileDrag', () => {
  it('is true only when the drag carries OS files', () => {
    expect(isOsFileDrag(fileTransfer([]))).toBe(true)
    expect(isOsFileDrag(fileTransfer([], ['Files', 'text/plain']))).toBe(true)
    expect(isOsFileDrag(fileTransfer([], ['text/plain']))).toBe(false)
    expect(isOsFileDrag(fileTransfer([], ['application/x-zen-tab']))).toBe(false)
    expect(isOsFileDrag(null)).toBe(false)
  })
})

describe('markdownFilesFromDrop', () => {
  const names = (files: File[]): string[] => files.map((f) => f.name)

  it('keeps only .md / .markdown files', () => {
    const result = markdownFilesFromDrop(
      fileTransfer([{ name: 'A.md' }, { name: 'B.png' }, { name: 'C.markdown' }, { name: 'D.txt' }])
    )
    expect(names(result)).toEqual(['A.md', 'C.markdown'])
  })

  it('is case-insensitive on the extension', () => {
    expect(names(markdownFilesFromDrop(fileTransfer([{ name: 'X.MD' }])))).toEqual(['X.MD'])
  })

  it('returns nothing for a null transfer', () => {
    expect(markdownFilesFromDrop(null)).toEqual([])
  })
})

describe('installMarkdownFileDropHandler', () => {
  function setup() {
    const listeners = new Map<string, EventListener>()
    const target = {
      addEventListener: vi.fn((type: string, cb: EventListener) => listeners.set(type, cb)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type))
    }
    const onMarkdownFiles = vi.fn()
    const cleanup = installMarkdownFileDropHandler(target, { onMarkdownFiles })
    const fire = (type: string, dataTransfer: DataTransfer | null) => {
      const e = { dataTransfer, preventDefault: vi.fn(), stopPropagation: vi.fn() }
      listeners.get(type)?.(e as unknown as Event)
      return e
    }
    return { target, onMarkdownFiles, cleanup, fire }
  }

  it('registers capture-phase dragover + drop listeners', () => {
    const { target } = setup()
    expect(target.addEventListener).toHaveBeenCalledWith('dragover', expect.any(Function), true)
    expect(target.addEventListener).toHaveBeenCalledWith('drop', expect.any(Function), true)
  })

  it('hands dropped markdown files to the callback and claims the event', () => {
    const { fire, onMarkdownFiles } = setup()
    const e = fire('drop', fileTransfer([{ name: 'A.md' }, { name: 'B.markdown' }]))
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
    expect(onMarkdownFiles).toHaveBeenCalledTimes(1)
    expect(onMarkdownFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['A.md', 'B.markdown'])
  })

  it('lets non-markdown OS files through to the editor importer', () => {
    const { fire, onMarkdownFiles } = setup()
    const e = fire('drop', fileTransfer([{ name: 'img.png' }]))
    expect(e.preventDefault).toHaveBeenCalled() // no navigate-to-file
    expect(e.stopPropagation).not.toHaveBeenCalled() // editor still imports
    expect(onMarkdownFiles).not.toHaveBeenCalled()
  })

  it('ignores in-app drags that carry no OS files', () => {
    const { fire, onMarkdownFiles } = setup()
    const e = fire('drop', fileTransfer([], ['application/x-zen-tab']))
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(e.stopPropagation).not.toHaveBeenCalled()
    expect(onMarkdownFiles).not.toHaveBeenCalled()
  })

  it('dragover marks OS file drags as a copy drop target', () => {
    const { fire } = setup()
    const dt = fileTransfer([{ name: 'A.md' }])
    const e = fire('dragover', dt)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(dt.dropEffect).toBe('copy')
  })

  it('dragover ignores non-file drags', () => {
    const { fire } = setup()
    const e = fire('dragover', fileTransfer([], ['text/plain']))
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('cleanup removes both listeners', () => {
    const { cleanup, target } = setup()
    cleanup()
    expect(target.removeEventListener).toHaveBeenCalledWith('dragover', expect.any(Function), true)
    expect(target.removeEventListener).toHaveBeenCalledWith('drop', expect.any(Function), true)
  })
})
