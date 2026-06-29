// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExternalFileApp } from './ExternalFileApp'

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ExternalFileApp', () => {
  let root: Root
  let host: HTMLDivElement
  let writeExternalFile: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    writeExternalFile = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'zen', {
      configurable: true,
      value: {
        readExternalFile: vi.fn().mockResolvedValue({
          path: '/tmp/large.ts',
          name: 'large.ts',
          kind: 'code',
          size: 2 * 1024 * 1024,
          body: 'export const value = 1\n'
        }),
        writeExternalFile,
        moveExternalFileToVault: vi.fn().mockResolvedValue({ vaultRoot: '/tmp/vault', relPath: 'large.ts' }),
        windowClose: vi.fn()
      }
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    vi.useRealTimers()
    act(() => root.unmount())
    host.remove()
  })

  it('routes code files to the lightweight textarea editor', async () => {
    await act(async () => {
      root.render(createElement(ExternalFileApp))
    })

    expect(host.querySelector('textarea')).toBeTruthy()
    expect(host.querySelector('.cm-editor')).toBeNull()
  })

  it('debounces saves from the lightweight editor', async () => {
    vi.useFakeTimers()
    await act(async () => {
      root.render(createElement(ExternalFileApp))
    })

    const textarea = host.querySelector('textarea')
    expect(textarea).toBeTruthy()

    await act(async () => {
      setTextAreaValue(textarea!, 'export const value = 2\n')
      vi.advanceTimersByTime(350)
    })

    expect(writeExternalFile).toHaveBeenCalledWith('export const value = 2\n')
  })
})
