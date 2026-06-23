# Markpad local-first upgrade plan

This is the working plan for pulling useful ideas from ZenNotes and public canvas/search references without importing their heavy runtime model.

## Hard constraints

- Stay Wails + Go + vanilla frontend unless a feature clearly earns a dependency.
- Keep note content as local files or simple local sidecar files, not a hidden database.
- Prefer SVG/CSS controls over icon fonts or large image assets.
- Keep feature indexes bounded, rebuildable, and optional.
- Do not code sync yet, but keep file formats sync-friendly.

## Reference takeaways

- ZenNotes useful ideas: vault folder, rich settings, task views, archive/trash lifecycle, command/search palettes, help/manual, local assets, and virtual views.
- ZenNotes parts to avoid: Electron, React/CodeMirror stack, monorepo/server/MCP surface, auto-updater, and large renderer dependencies.
- tldraw persistence separates document data from local session/camera state, which is the right model for future canvas files.
- Excalidraw saves plaintext JSON with `type`, `version`, `source`, `elements`, `appState`, and `files`, which is a good interoperability target for canvas export/import.
- MiniSearch and FlexSearch are viable future browser-side indexes, but a dependency-free scan is better for the current loaded-file scope.

Sources:

- https://tldraw.dev/docs/persistence
- https://docs.excalidraw.com/docs/codebase/json-schema
- https://github.com/lucaong/minisearch
- https://emersonbottero.github.io/flexsearch/

## Phase 1: polish without backend risk

- Add CSS-variable themes: two light, two dark.
- Override Markdown and code preview colors locally so external light GitHub/highlight styles do not break dark themes.
- Add a loaded-file search palette over open documents.
- Keep search dependency-free and avoid persistent content indexes for now.
- Improve help/preferences so users can discover new local-first controls.
- Add a frontend canvas draft that uses one native `<canvas>`, local JSON autosave, and capped device pixel ratio before backend file persistence.
- Add Local Footprint diagnostics for process RSS, Go heap, loaded text, canvas JSON, draft trash, localStorage, and browser heap when available.

## Phase 2: local vault layer

- Current backend slice: choose a default local folder, list bounded files, and perform capped streaming search without watchers or a persistent index.
- Add a configurable default folder.
- Support opening a folder as a local vault while keeping current individual-file behavior.
- Store vault metadata under `.markpad/`.
- Keep cloud/sync concepts out of runtime code for now.

Proposed local layout:

```text
Vault/
  notes.md
  tasks.md
  drawings/
  .markpad/
    vault.json
    trash.json
    task-view.json
    canvas-session.json
```

## Phase 3: search

- Current backend slice: loaded-document search runs in Go with active-content override, 2 MiB per-document cap, snippet results, and no persistent index.
- Backend first: use Go for file walking, size caps, ignore rules, and cancellation.
- Prefer ripgrep if present for large vault text search, with a built-in Go fallback.
- Cache only file metadata and small text excerpts; never keep entire vault contents in renderer memory.
- Renderer search palette should page results and request snippets lazily.

## Phase 4: trash

- Current frontend slice: unsaved drafts are moved to local Trash and retained for 30 days via `localStorage`.
- Current backend slice: saved files are copied into Markpad-managed trash storage, removed from original location after successful copy, listed/restored/deleted through a trash manifest, and pruned after 30 days.
- Soft-delete drafts and vault files for 30 days by moving them to `.markpad/trash/`.
- Track original path, deleted timestamp, size, and title in `.markpad/trash.json`.
- Add Trash view with restore, delete permanently, and empty expired.
- Cleanup should run opportunistically on startup and when opening Trash.

## Phase 5: tasks

- Current frontend slice: quick task capture appends to a loaded `Tasks.md`/`Tasks` draft or creates a plain Markdown Tasks draft.
- Use standard Markdown task lines in a normal file by default.
- Recognize:

```md
- [ ] Task title due:2026-06-23 !high @waiting #tag
- [x] Done task
```

- Start with one `tasks.md` file to avoid vault lock-in.
- Later scan all vault Markdown files for task lines.
- Views are projections over Markdown: list, calendar, kanban.
- Kanban drag updates checkbox/status tokens, not a proprietary task database.

## Phase 6: canvas

- Current frontend slices: native `<canvas>` infinite surface, pen/shape/text/arrow tools, fit-to-content, live element/zoom status, bounded undo/redo, Markpad JSON autosave, Markpad/Obsidian-style JSON import, current-document-to-canvas loading, JSON export, SVG export, and save-to-draft for existing Save As persistence.
- Start with a native `<canvas>` infinite surface, not tldraw/excalidraw bundles.
- Support pan, zoom, pen, rectangle, ellipse, line, arrow, text, eraser, color, stroke width.
- Store drawings as small JSON plus optional exported SVG/PNG.
- Use an Excalidraw-like JSON shape list for portability:

```json
{
  "type": "markpad-canvas",
  "version": 1,
  "source": "markpad",
  "elements": [],
  "appState": {
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
```

- Keep session camera/selection separate from document content, matching the tldraw persistence model.

## Phase 7: sync-ready but still local

- Keep every durable artifact file-based and mergeable where possible.
- Stable IDs for tasks/canvas elements.
- Avoid renderer-only hidden state for anything that must sync later.
- Add conflict metadata only when sync work begins.
