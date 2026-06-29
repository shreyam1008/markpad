import type { DragEvent } from 'react'
import { describe, expect, it } from 'vitest'
import {
  ZEN_DND_ASSET_MIME,
  ZEN_DND_MIME,
  hasZenAssetItem,
  hasZenItem,
  readDragPayload,
  setDragPayload
} from './dnd'

function fakeDragEvent(): DragEvent {
  const data = new Map<string, string>()
  const dataTransfer = {
    types: [] as string[],
    effectAllowed: 'none',
    setData(type: string, value: string) {
      data.set(type, value)
      if (!this.types.includes(type)) this.types.push(type)
    },
    getData(type: string) {
      return data.get(type) ?? ''
    }
  }
  return { dataTransfer } as unknown as DragEvent
}

describe('drag payload helpers', () => {
  it('keeps asset drags distinct from note/folder drags', () => {
    const event = fakeDragEvent()

    setDragPayload(event, { kind: 'asset', path: 'zennotes logo.png' })

    expect(event.dataTransfer.getData('text/plain')).toBe('')
    expect(event.dataTransfer.types).toContain(ZEN_DND_ASSET_MIME)
    expect(event.dataTransfer.types).not.toContain(ZEN_DND_MIME)
    expect(hasZenAssetItem(event)).toBe(true)
    expect(hasZenItem(event)).toBe(false)
    expect(readDragPayload(event)).toEqual({ kind: 'asset', path: 'zennotes logo.png' })
  })
})
