// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeView } from './HomeView'

const mocks = vi.hoisted(() => {
  const refreshTasks = vi.fn().mockResolvedValue(undefined)
  const state = {
    notes: [
      {
        path: 'inbox/Old.md',
        title: 'Old',
        folder: 'inbox',
        siblingOrder: 0,
        createdAt: 1,
        updatedAt: 1,
        size: 10,
        tags: [],
        wikilinks: [],
        assetEmbeds: [],
        hasAttachments: false,
        excerpt: 'Old'
      }
    ],
    vaultTasks: [],
    tasksLoading: false,
    vimMode: false,
    selectNote: vi.fn(),
    openTaskAt: vi.fn(),
    toggleTaskFromList: vi.fn(),
    refreshTasks,
    openTasksView: vi.fn(),
    vaultSettings: {
      dailyNotes: { enabled: false },
      weeklyNotes: { enabled: false }
    },
    createAndOpen: vi.fn(),
    createDatabase: vi.fn(),
    createDrawingAndOpen: vi.fn(),
    openTodayDailyNote: vi.fn(),
    openWeeklyNoteForDate: vi.fn()
  }

  return { refreshTasks, state }
})

vi.mock('../store', () => ({
  useStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)
}))

describe('HomeView startup behavior', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('does not scan every note for tasks on mount', async () => {
    await act(async () => {
      root.render(createElement(HomeView, { sidebarOpen: true, onShowSidebar: vi.fn() }))
    })

    expect(mocks.refreshTasks).not.toHaveBeenCalled()
  })

  it('keeps task scanning available as an explicit action', async () => {
    await act(async () => {
      root.render(createElement(HomeView, { sidebarOpen: true, onShowSidebar: vi.fn() }))
    })

    const scanButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Scan tasks'
    )
    expect(scanButton).toBeTruthy()

    await act(async () => {
      scanButton!.click()
    })

    expect(mocks.refreshTasks).toHaveBeenCalledTimes(1)
  })
})
