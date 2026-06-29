import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { isTasksTabPath } from '@shared/tasks'
import { isTagsTabPath } from '@shared/tags'
import { isHelpTabPath } from '@shared/help'
import { isArchiveTabPath } from '@shared/archive'
import { isTrashTabPath } from '@shared/trash'
import { isQuickNotesTabPath } from '@shared/quick-notes'
import { resolveSystemFolderLabels } from '../lib/system-folder-labels'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('button,a,input,textarea,[role="button"]')
}

export function TitleBar(): JSX.Element {
  const vault = useStore((s) => s.vault)
  const activeNote = useStore((s) => s.activeNote)
  const selectedPath = useStore((s) => s.selectedPath)
  const systemFolderLabels = useStore((s) => s.systemFolderLabels)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const createAndOpen = useStore((s) => s.createAndOpen)
  const refreshNotes = useStore((s) => s.refreshNotes)
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const openVaultPicker = useStore((s) => s.openVaultPicker)
  const openHelpView = useStore((s) => s.openHelpView)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const isMac = window.zen.platformSync() === 'darwin'
  const labels = resolveSystemFolderLabels(systemFolderLabels)
  const mod = isMac ? '⌘' : 'Ctrl+'

  const title = activeNote
    ? activeNote.title
    : isQuickNotesTabPath(selectedPath)
      ? labels.quick
    : isTasksTabPath(selectedPath)
      ? labels.tasks
      : isTagsTabPath(selectedPath)
        ? 'Tags'
        : isHelpTabPath(selectedPath)
          ? 'Help'
          : isArchiveTabPath(selectedPath)
            ? labels.archive
          : isTrashTabPath(selectedPath)
            ? labels.trash
          : vault
            ? vault.name
            : 'ShreyamNotes'
  const menuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        label: 'New note',
        hint: `${mod}N`,
        onSelect: () => void createAndOpen('inbox', '', { focusTitle: true })
      },
      {
        label: 'Search notes',
        hint: `${mod}P`,
        onSelect: () => setCommandPaletteOpen(true)
      },
      { kind: 'separator' },
      {
        label: 'Switch vault',
        onSelect: () => void openVaultPicker()
      },
      {
        label: 'Refresh vault',
        onSelect: () => void refreshNotes()
      },
      { kind: 'separator' },
      {
        label: 'Settings',
        hint: `${mod},`,
        onSelect: () => setSettingsOpen(true)
      },
      {
        label: 'About ShreyamNotes',
        onSelect: () => setSettingsOpen(true, 'about')
      },
      {
        label: 'Help',
        onSelect: () => void openHelpView()
      },
      { kind: 'separator' },
      {
        label: 'Minimize window',
        onSelect: () => window.zen.windowMinimize()
      },
      {
        label: isMac ? 'Zoom window' : 'Maximize window',
        onSelect: () => window.zen.windowToggleMaximize()
      },
      {
        label: 'Close ShreyamNotes',
        hint: `${mod}Q`,
        onSelect: () => window.zen.windowClose()
      }
    ],
    [
      createAndOpen,
      mod,
      openHelpView,
      openVaultPicker,
      refreshNotes,
      setCommandPaletteOpen,
      setSettingsOpen,
    ]
  )

  return (
    <div
      className="drag-region glass-titlebar flex h-11 shrink-0 select-none items-center px-4 text-xs text-ink-500"
      style={{ paddingLeft: isMac ? 80 : 12 }}
      onContextMenu={(event) => {
        if (isInteractiveTarget(event.target)) return
        event.preventDefault()
        setMenu({ x: event.clientX, y: event.clientY })
      }}
      onDoubleClick={(event) => {
        if (isInteractiveTarget(event.target)) return
        window.zen.windowToggleMaximize()
      }}
    >
      <div className="flex flex-1 items-center justify-center gap-2 text-center tracking-wide">
        <span className="truncate">{title}</span>
        {workspaceMode === 'remote' && (
          <span className="rounded-full border border-paper-300/70 bg-paper-100/80 px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.14em] text-ink-700">
            Remote
          </span>
        )}
      </div>
      {!isMac && (
        <div className="flex items-center gap-1">
          <WinButton onClick={() => window.zen.windowMinimize()} label="–" />
          <WinButton onClick={() => window.zen.windowToggleMaximize()} label="▢" />
          <WinButton
            onClick={() => window.zen.windowClose()}
            label="✕"
            className="hover:bg-red-500/90 hover:text-white"
          />
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function WinButton({
  onClick,
  label,
  className
}: {
  onClick: () => void
  label: string
  className?: string
}): JSX.Element {
  return (
    <button
      className={`no-drag flex h-8 w-10 items-center justify-center rounded-md text-ink-600 hover:bg-paper-200 ${className ?? ''}`}
      onClick={onClick}
      aria-label={label}
    >
      {label}
    </button>
  )
}
