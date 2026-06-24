# Local-First Feature Decisions

Updated: 2026-06-24

## Decision summary

| Area | Direction now | Defer |
| --- | --- | --- |
| Search | Rebuildable SQLite FTS5 sidecar over local files, merged with in-memory loaded buffers | Embeddings, bundled search daemons, trigram indexes by default |
| Tasks | Markdown task list items as source of truth, with visible metadata tokens | Calendar-grade VTODO sync, hidden IDs until line-hash identity is insufficient |
| Canvas | Markpad-owned versioned JSON canvas files | Bundling tldraw/Excalidraw/InfiniPaint as the primary engine before measurement |
| Theme/Icon assets | CSS variables plus tiny self-contained SVG only; keep the existing asset budgets as hard guardrails | Theme screenshots, texture packs, icon webfonts, framework-scale icon bundles |
| Create workflow | Sidebar-first explicit file-type creation for Note, Task file, Canvas, and later Other files | Tabs-first workspace model, folder-first navigation model, generic unvalidated extension creation |

## Search direction

Use a sidecar SQLite FTS5 database as a derived cache, not the source of truth.

SQLite FTS5 is designed for full-text search over document collections and supports `MATCH`, prefix indexes, external-content tables, and relevance ranking through `bm25()` / the hidden `rank` column. Markpad should keep user files authoritative and rebuild the index when needed.

Initial implementation constraints:

- Index Markdown/text files in bounded chunks.
- Keep unsaved loaded buffers in memory and merge them with FTS results.
- Stream indexing from disk; do not bridge full workspace contents into the WebView.
- Expose file count, skipped count, indexed bytes, elapsed time, DB path, and DB size in diagnostics.
- Keep the FTS DB rebuildable and safe to delete.
- Decide the Go SQLite driver only after a binary-size check. A pure-Go driver avoids CGO friction but may increase binary size; CGO drivers need platform packaging care.

Primary references:

- SQLite FTS5 docs: https://sqlite.org/fts5.html

## Task direction

Use Markdown task list items as the source of truth:

```md
- [ ] Write task due:2026-07-01 #project @context
- [x] Completed task
```

GFM defines task list items with `[ ]` and `[x]` markers. Todo.txt conventions are useful for portable metadata such as `due:YYYY-MM-DD`, `+project`, `#tag`, and `@context`, but Markpad should keep Markdown files as the primary task file format because users already edit Markdown.

Initial implementation constraints:

- Toggle tasks by path + line + original text hash, not line number alone.
- Leave metadata visible in the file rather than hidden in app-only storage.
- Keep any task index derived and rebuildable.
- Export to Todo.txt later, but do not make Todo.txt the primary internal model unless users ask for it.
- Defer RFC 5545 VTODO until calendar interoperability becomes a concrete phase.

Primary references:

- GitHub Flavored Markdown task list items: https://github.github.com/gfm/
- Todo.txt format and metadata convention: https://github.com/todotxt/todo.txt
- Todo.txt project summary: https://todotxt.org/

## Canvas direction

Use Markpad-owned versioned JSON files for canvas persistence first.

The current goal is a lightweight local infinite canvas, not a full whiteboard runtime. A small schema keeps binary size stable, keeps files readable/exportable, and makes the native `.markcanvas.json` format explicit before broader JSON Canvas / Obsidian interchange.

Initial implementation constraints:

- Store native canvas files as `.markcanvas.json` versioned JSON with `type`, `version`, `schema`, `source`, `meta`, `elements`, `appState`, and `files`.
- Do not store `camera`, `tool`, `selection`, `grid`, `snap`, `minimap`, `undo`, `history`, `cachedBounds`, `rasterPreview`, or `spatialIndex` in the portable document.
- Treat `.canvas` as JSON Canvas / Obsidian interchange only: import into native `.markcanvas.json`, export from native on demand, and keep adapter logic explicit.
- Preserve the Markpad `type`, schema URL, and `meta.format` in native files even after import; record external provenance in `meta.importedFrom`.
- Assume JSON Canvas / Obsidian interchange can be lossy for app-specific metadata and transient state, so it must not replace the native working copy by default.
- Keep embedded image assets external or separately capped; do not inline large blobs by default.
- Cache element bounds and schedule renders with `requestAnimationFrame` before adding heavier features.
- Add JSON Canvas / Obsidian import/export before Excalidraw if users need interoperability.
- Treat tldraw as deferred because current SDK production use requires a license key.
- Treat InfiniPaint as inspiration only; its own docs warn image/GIF canvas content can use a lot of memory.

Primary references:

- JSON Canvas spec: https://jsoncanvas.org/spec/1.0/
- Obsidian Canvas help: https://obsidian.md/help/plugins/canvas
- Excalidraw JSON schema docs: https://docs.excalidraw.com/docs/codebase/json-schema
- Excalidraw `serializeAsJSON` utility: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils
- tldraw persistence docs: https://tldraw.dev/docs/persistence
- tldraw license docs: https://tldraw.dev/community/license
- InfiniPaint repository: https://github.com/ErrorAtLine0/infinipaint

## Theme and icon asset direction

Theme and icon changes must stay in CSS variables, tiny self-contained SVG, and the existing asset budgets rather than new packaged media.

Initial implementation constraints:

- Do not ship theme screenshots, texture packs, icon webfonts, or framework-sized icon bundles.
- Keep theme differentiation in variables, borders, shadows, and typography scale instead of separate image assets.
- Keep shipped SVG assets self-contained: no external hrefs, embedded raster payloads, scripts, or font-face rules.
- Treat the asset byte caps in `assets_test.go` as hard release guardrails, not soft goals.

## Create workflow direction

Markpad should keep a files-first creation surface in the sidebar. The `New` action is a typed create menu, not a tab launcher and not a folder-first project browser.

Initial implementation constraints:

- `Note` creates a local Markdown note when a default folder is configured, otherwise it falls back to an unsaved Markdown draft.
- `Task file` opens the portable `Tasks.md` setup and task views rather than inventing a hidden task database.
- `Canvas` creates a native `.markcanvas.json` file through Markpad's local canvas backend; the top-bar Canvas button opens that active canvas file when selected or falls back to the scratch canvas otherwise.
- `Other file` must stay disabled until extension validation, template choice, and collision behavior are explicit.
- The sidebar `+ New` menu must keep the concrete file affordances visible: Note, Task file, Canvas, and a disabled Other file placeholder until the remaining rules are specified.
- Task file is a file workflow: open or set up `Tasks.md`, then show list, calendar, and kanban views over Markdown task lines from files.
- Task workflow menus should expose List, Calendar, Kanban, Quick task, and Task setup directly from the sidebar.
- Canvas creation must produce a native `.markcanvas.json` document. The top-bar Canvas button opens the active native canvas file when selected, otherwise it falls back to the local scratch canvas.
- Canvas workflow menus should expose Open canvas, New canvas file, Write active, Save draft JSON, and Loaded files map without adding a heavy drawing dependency.
- Choosing a local folder is a storage prerequisite for file-backed note/canvas creation, not the default product narrative or startup mode.
- If open-file chips, recents, or history evolve, they remain secondary to sidebar file navigation and must not redefine Markpad as a tabs app.
- Keep the sidebar as the main place for creation and navigation. Do not introduce a tab system or make folder loading the default mental model.

## Phase order

1. Stabilize diagnostics and budgets.
2. Improve current UI readability and identity.
3. Add task rendering/paging and draft-trash byte caps.
4. Add FTS5 sidecar as an optional, rebuildable search cache.
5. Add canvas bounds caching and versioned JSON save/load.
6. Add import/export adapters only after measuring size and memory impact.
