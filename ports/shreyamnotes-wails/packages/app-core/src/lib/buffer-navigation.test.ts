import { describe, expect, it } from 'vitest'
import type { NoteMeta } from '@shared/ipc'
import type { PaneLayout } from './pane-layout'
import { getBufferNavigationTarget } from './buffer-navigation'

function note(path: string, updatedAt: number, folder: NoteMeta['folder'] = 'inbox'): Pick<NoteMeta, 'path' | 'folder' | 'updatedAt'> {
  return { path, folder, updatedAt }
}

function leaf(id: string, tabs: string[], activeTab: string | null = tabs[0] ?? null): PaneLayout {
  return { kind: 'leaf', id, tabs, pinnedTabs: [], activeTab }
}

describe('getBufferNavigationTarget', () => {
  it('moves to the next visible buffer in the active pane', () => {
    const layout = leaf('pane-a', ['one.md', 'two.md'], 'one.md')

    expect(getBufferNavigationTarget(layout, 'pane-a', [], 1)).toEqual({
      kind: 'focus',
      paneId: 'pane-a',
      path: 'two.md'
    })
  })

  it('moves to the previous visible buffer across panes', () => {
    const layout: PaneLayout = {
      kind: 'split',
      id: 'root',
      direction: 'row',
      sizes: [0.5, 0.5],
      children: [
        leaf('pane-a', ['one.md'], 'one.md'),
        leaf('pane-b', ['two.md'], 'two.md')
      ]
    }

    expect(getBufferNavigationTarget(layout, 'pane-b', [], -1)).toEqual({
      kind: 'focus',
      paneId: 'pane-a',
      path: 'one.md'
    })
  })

  it('falls back to recent live notes when only one tab is open', () => {
    const layout = leaf('pane-a', ['one.md'], 'one.md')
    const notes = [
      note('trashed.md', 4, 'trash'),
      note('three.md', 3),
      note('two.md', 2),
      note('one.md', 1)
    ]

    expect(getBufferNavigationTarget(layout, 'pane-a', notes, 1)).toEqual({
      kind: 'open',
      paneId: 'pane-a',
      path: 'three.md'
    })
  })

  it('creates a quick note when there is nothing else to visit', () => {
    const layout = leaf('pane-a', [], null)

    expect(getBufferNavigationTarget(layout, 'pane-a', [], 1)).toEqual({
      kind: 'create-quick'
    })
  })
})
