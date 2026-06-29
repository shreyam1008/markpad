import type { NoteMeta } from '@shared/ipc'
import { allLeaves, findLeaf, type PaneLayout } from './pane-layout'

export type BufferNavigationTarget =
  | { kind: 'focus'; paneId: string; path: string }
  | { kind: 'open'; paneId: string; path: string }
  | { kind: 'create-quick' }
  | { kind: 'none' }

type BufferNote = Pick<NoteMeta, 'path' | 'folder' | 'updatedAt'>

export interface BufferNavigationRuntime {
  paneLayout: PaneLayout
  activePaneId: string
  notes: BufferNote[]
  focusTabInPane: (paneId: string, path: string) => Promise<void>
  openNoteInPane: (paneId: string, path: string) => Promise<void>
  createAndOpen: (
    folder: 'quick',
    subpath: string,
    options: { focusTitle: boolean }
  ) => Promise<unknown>
}

export function getBufferNavigationTarget(
  paneLayout: PaneLayout,
  activePaneId: string,
  notes: BufferNote[],
  delta: 1 | -1
): BufferNavigationTarget {
  const leaf = findLeaf(paneLayout, activePaneId)
  if (!leaf) return { kind: 'none' }

  const seen = new Set<string>()
  const order: string[] = []
  for (const candidate of allLeaves(paneLayout)) {
    for (const path of candidate.tabs) {
      if (seen.has(path)) continue
      seen.add(path)
      order.push(path)
    }
  }

  if (order.length < 2) {
    const fallback = notes
      .filter((note) => note.folder !== 'trash')
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
    for (const note of fallback) {
      if (seen.has(note.path)) continue
      seen.add(note.path)
      order.push(note.path)
    }
  }

  if (order.length < 2) return { kind: 'create-quick' }

  const baseIndex = leaf.activeTab ? order.indexOf(leaf.activeTab) : -1
  const startIndex = baseIndex >= 0 ? baseIndex : 0
  const nextIndex = (startIndex + delta + order.length) % order.length
  const nextPath = order[nextIndex]
  const owningLeaf = allLeaves(paneLayout).find((candidate) =>
    candidate.tabs.includes(nextPath)
  )

  if (owningLeaf && owningLeaf.id !== leaf.id) {
    return { kind: 'focus', paneId: owningLeaf.id, path: nextPath }
  }
  if (leaf.tabs.includes(nextPath)) {
    return { kind: 'focus', paneId: leaf.id, path: nextPath }
  }
  return { kind: 'open', paneId: leaf.id, path: nextPath }
}

export function navigateActiveBuffer(
  runtime: BufferNavigationRuntime,
  delta: 1 | -1
): void {
  const target = getBufferNavigationTarget(
    runtime.paneLayout,
    runtime.activePaneId,
    runtime.notes,
    delta
  )

  if (target.kind === 'focus') {
    void runtime.focusTabInPane(target.paneId, target.path)
    return
  }
  if (target.kind === 'open') {
    void runtime.openNoteInPane(target.paneId, target.path)
    return
  }
  if (target.kind === 'create-quick') {
    void runtime.createAndOpen('quick', '', { focusTitle: true })
  }
}
