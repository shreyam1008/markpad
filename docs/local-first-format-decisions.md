# Local-first format decisions

This document fixes the storage direction for the current local-only upgrade. The rule is simple: user files stay useful outside Markpad, indexes stay rebuildable, and UI state never becomes the source of truth.

## Research anchors

- SQLite FTS5 is the best fit for fast local search because it is embedded, mature, and supports full-text indexes that can be rebuilt from source files: https://sqlite.org/fts5.html
- ripgrep is the right behavior reference for bounded folder scans because it is line-oriented, fast, and respects ignore/binary defaults, but Markpad should not bundle a separate search binary in the lightweight core: https://github.com/BurntSushi/ripgrep
- tldraw persistence separates durable document state from per-user session state. Markpad should mirror that split for canvas files.
- Excalidraw stores local scenes as plaintext JSON in `.excalidraw` files. Markpad canvas should remain plain JSON and provide import/export compatibility rather than a binary-only format.

## Search

Use a rebuildable SQLite FTS5 sidecar index for workspace-wide search.

- Source of truth: user files on disk.
- Index location: app data cache, not inside the notes folder by default.
- Index content: path, title, modified time, size, extracted text, and lightweight snippets.
- Rebuild behavior: safe to delete and regenerate at any time.
- Memory rule: keep only the active result page and small snippet windows in the webview.
- Phase 1 query scope: files Markpad has loaded or indexed locally.
- Phase 2 sync scope: index remains local per device; sync transfers files and metadata, not search cache.
- Main view: summarize result count, loaded/local distribution, and parsed operator counts from the current result page only.

Implementation bias:

- Prefer FTS5 `unicode61` tokenization for normal notes.
- Prefer an external-content or contentless index pattern so the searchable text is not duplicated as another authoritative database.
- Use incremental indexing from file modified time and size.
- Keep direct folder scans bounded and dependency-free in Phase 1; copy ripgrep-style defaults such as skipping obvious binary files and keeping snippets small.

## Tasks

Use a Markdown task file as the canonical format.

- Default file: `tasks.md` in the selected Markpad folder.
- Task line format: GitHub-style Markdown tasks, for example `- [ ] Write release notes`.
- Metadata: optional inline attributes after the task text, for example `@due(2026-07-01) @status(todo) @priority(high)`.
- Views: list, calendar, and kanban are projections of the same file.
- No lock-in: users can edit the task file in any Markdown editor.
- Diagnostics: Task Source Profile must expose loaded/local counts, due buckets, active filters, generated `tasks.md` size, and export readiness.
- Main view: summarize visible/total tasks, loaded/local sources, task files, and due buckets from the current parsed Markdown only.

The app may keep a small parsed cache in memory, but it must be disposable and rebuilt from `tasks.md`.

Current v1 implementation note: Markpad recognizes GitHub-style checkbox lines and lightweight tokens such as `due:YYYY-MM-DD`, `!high`, `@waiting`, and `#tag`. List, calendar, kanban, agenda, exports, and canvas boards are derived views over those Markdown lines.

## Canvas

Use plain JSON snapshots with document and session split.

- Canonical extension: `.markcanvas.json`.
- Document state: pages, elements, bindings, assets, and version.
- Session state: camera, selection, grid, current tool, and other UI-only state.
- Autosave: write document changes atomically, and keep session state separate.
- Export: support `.excalidraw` JSON for broad compatibility.
- Import: accept `.excalidraw` JSON where practical and convert to Markpad elements.
- Diagnostics: Canvas Storage Profile must expose document bytes, session bytes, undo snapshot bytes, format version, and export targets.
- Inventory: include element type counts in storage diagnostics so canvas complexity is visible without rendering or scanning assets.

Minimal shape:

```json
{
  "type": "markpad-canvas",
  "version": 1,
  "document": {
    "pages": [],
    "elements": [],
    "assets": []
  },
  "session": {
    "camera": { "x": 0, "y": 0, "zoom": 1 },
    "selection": []
  }
}
```

The webview should not keep heavyweight raster previews in memory unless the user is exporting or actively viewing them.

Current v1 implementation note: Markpad's native export stores `elements`, `appState`, `files`, `meta`, and schema metadata in plain JSON, while local camera/tool/grid state is stored separately as session state. This keeps the exported drawing portable and the active viewport device-local.

## Trash

Trash remains local and predictable.

- Default retention: 30 days.
- Draft trash: may live in local app state while drafts are not real files.
- Saved file trash: store recoverable file copies outside localStorage.
- Reports: footprint exports should include trash bytes, item counts, retention buckets, and next expiry.
- Diagnostics: Trash Cleanup Profile must show retained bytes, expired candidates, backend cleanup support, and safe cleanup actions before destructive cleanup.
- Main view: show retention buckets and next expiry from existing Trash metadata; do not scan workspaces or export deleted draft bodies by default.
- Cleanup: automatic cleanup can run opportunistically on startup or when opening Trash.

## Future sync layer

Do not code sync in phase 1, but keep the file model sync-friendly.

- Sync source: files plus small metadata manifests.
- Conflict behavior: preserve both versions first, resolve later.
- Search indexes: never sync.
- Canvas session state: device-local by default.
- Git integration: keep compatible with normal file diffs where possible.

## Performance budget

- Avoid adding large icon packs or canvas libraries to the core bundle.
- Keep menu and command-palette polish text/CSS based, with category chips and command metadata instead of bitmap or font-icon packs.
- Track command text-icon usage in Lightweight Assets so menu polish remains measurable without icon fonts or sprite sheets.
- Keep Theme Lab summaries metadata-only: current theme, light/dark counts, preset matches, and zero theme assets.
- Keep editor layout polish as local UI state; Layout Profile should expose split, focus, compact, wrap, reading width, and zoom without writing to documents.
- Show editor/preview lane share in Layout Profile from existing split state; do not persist layout metadata into document files.
- Keep Upgrade Map as a metadata dashboard over existing diagnostics; it must not scan workspaces, load assets, or become a new source of truth.
- Keep Upgrade Map exports limited to Markdown, JSON, and CSV metadata snapshots; do not include document bodies or deleted draft contents.
- Let Upgrade Map search metrics use the last parsed query/result state only; opening the map must not execute a new search.
- Let Upgrade Map include saved-file Trash counts, bytes, retention buckets, and next expiry from the existing Trash manifest only.
- Let Upgrade Map task counts use the current in-memory task parse only; opening the map must not trigger a workspace task scan.
- Let Upgrade Map canvas metrics use the current canvas document/session only: element types, view state, grid, snap, minimap, and undo count.
- Keep files as the source of truth and databases as rebuildable accelerators.
- Prefer streaming, paging, and lazy parsing over loading a whole workspace into the webview.
- Keep localStorage for small preferences and draft/session state only.
