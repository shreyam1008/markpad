# Phase-2 sync boundary

Markpad phase 1 is local-only. This document defines how current file formats and UI state should stay shaped so a future sync layer can be added without rewriting local-first behavior.

## Do not build in phase 1

- No accounts, login screens, background sync daemon, remote storage API, or cloud conflict UI.
- No remote telemetry or remote search/index service.
- No hidden proprietary task or canvas database created only to support sync.

## Content state that may sync later

These are user-owned files or file-adjacent manifests:

- Markdown notes and text/code files in the chosen local folder.
- Markdown task checkbox lines inside normal Markdown files.
- Markpad canvas documents using `markpad-canvas-v1` JSON.
- Obsidian/JSON Canvas and Excalidraw export/import files when users choose those formats.
- Attachments stored as files, not inline JSON blobs.
- Trash metadata only when a future sync design explicitly supports deletion recovery across devices.

## Machine-local state that should not sync by default

These settings are per-device preferences:

- Window layout, sidebar state, focus mode, compact mode, zoom, split ratio.
- Current theme and theme lab selection.
- Search scope, search recents, command recents, active result selection.
- Task view mode, task filters, task query, modal scroll position.
- Canvas camera, selected tool, selection, minimap visibility, grid visibility, snap setting.
- Editor undo history, canvas undo history, transient draft timers, runtime diagnostics.

## Sync-safe file principles

- Plain text first: Markdown, JSON, CSV, ICS, and Todo.txt exports remain readable outside Markpad.
- Content files should not include device-only session state.
- Canvas content and canvas view state remain separable.
- Tasks remain Markdown checkbox lines; task views are derived.
- Local folder structure should remain meaningful without Markpad running.
- Conflict resolution should preserve both sides rather than silently overwriting local edits.

## Future conflict direction

When sync is eventually implemented, prefer folder-level sync with explicit conflict files:

```text
note.md
note.conflict-2026-06-24-device.md
board.canvas
board.conflict-2026-06-24-device.canvas
```

For canvas JSON, conflict handling should preserve both documents first. Smarter element-level merging can come later only if the document schema has stable element identifiers and a tested merge story.

## Design invariant

Markpad must remain useful with sync removed. The sync layer should be an optional transport over local files, not the source of truth.
