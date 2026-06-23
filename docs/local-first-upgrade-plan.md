# Markpad local-first upgrade plan

This plan keeps Markpad lightweight: local files remain the source of truth, the frontend stays dependency-light, and larger capabilities are built in Go or small custom browser code instead of bundling heavy editors.

## Reference decisions

- Search: prefer a Go-backed SQLite FTS5 index for the local folder because SQLite FTS5 is built for full-text search over document collections and supports ranking through `bm25()`: https://sqlite.org/fts5.html
- Loaded-file search: keep the current in-memory path for open/cached files. If richer loaded-document ranking is needed later, evaluate tiny in-browser indexes such as MiniSearch before FlexSearch: https://github.com/lucaong/minisearch and https://github.com/nextapps-de/flexsearch
- Canvas storage: keep `.canvas` / JSON Canvas as the portable interchange format because it is open, readable, and intended for infinite-canvas interoperability: https://jsoncanvas.org/ and https://github.com/obsidianmd/jsoncanvas
- Canvas editor: do not bundle tldraw or Excalidraw for now. Borrow interaction patterns, but keep Markpad's custom canvas renderer. tldraw's document/session split is still a good persistence model: https://tldraw.dev/docs/persistence
- Desktop shell: continue leaning on Wails for the Go/local OS bridge and web UI runtime rather than shipping a Chromium bundle: https://wails.io/docs/reference/runtime/intro/

## Phase 1: local polish and capability

- Search: keep scope chips for Loaded, Local, and All; add discoverable syntax help; then move local-folder search to a persistent FTS index when backend files can be touched safely.
- Tasks: treat Markdown task lines as the user-owned source format. Keep Tasks.md as the default append target and expose list, calendar, and kanban as views over the same files.
- Trash: keep 30-day soft delete semantics visible in the UI, with manual cleanup available from Trash.
- Canvas: keep JSON Canvas export and Markpad JSON save paths; improve selection, dimensions, clipboard, zoom, and keyboard operations before considering heavier drawing libraries.
- Themes and UI: expand through CSS variables only. Avoid image-heavy assets; prefer text glyphs, inline SVG, and CSS-drawn affordances.
- Editor: keep split presets, soft wrap, cursor/selection stats, and local-only document outline.

## Phase 2: prepared but not implemented yet

- Sync: design around a local file graph plus conflict metadata. Do not encode cloud assumptions into Phase 1 storage.
- Search index portability: keep the FTS database disposable. Files are canonical; indexes can be rebuilt.
- Canvas sync: separate document state from session state, following the tldraw-style split. Sync the document, keep camera/selection local per device.
- File watching: use a bounded watcher/index queue when adding live indexing. Avoid recursive hidden/vendor folders and debounce burst writes.

## Performance guardrails

- No heavyweight canvas/editor dependencies in Phase 1.
- No bundled icon packs; use CSS, currentColor SVG, or compact glyph labels.
- Local search should cap file size and file type scanning, stream file reads, and index incrementally.
- UI lists should render summaries and snippets, not whole file bodies.
- Any future index must be optional and rebuildable from the user's local files.
