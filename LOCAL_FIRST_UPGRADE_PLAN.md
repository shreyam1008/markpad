# Markpad local-first upgrade plan

## Product direction

Markpad stays a lightweight local-first desktop app. The app should feel as refined as heavier note apps while keeping RAM, binary size, and startup cost low.

## Source-of-truth rules

- Notes stay as Markdown files on disk.
- Tasks stay as Markdown task items inside user-owned files.
- Trash keeps deleted files recoverable for 30 days by default, then cleans up.
- Canvas documents should save as JSON with a clear schema and a future export path to `.excalidraw`.
- Search indexes, task views, recents, and diagnostics are derived data. They must be rebuildable from local files.
- Sync is a later layer. Local file behavior must not depend on cloud identity, accounts, or a remote database.

## Search direction

- Current path: search loaded Markdown fast with a bounded in-memory cache.
- Next path: add a backend workspace search that streams Markdown files with bounded goroutines and cancellation.
- Later path: evaluate an optional SQLite FTS5 index for large vaults. SQLite FTS5 supports virtual full-text tables and external/contentless index modes, which can reduce duplicated stored content when the Markdown files remain authoritative.
- Avoid heavy search libraries until we have measured large-vault behavior.

## Task direction

- Use Markdown tasks as the portable format.
- Prefer views over storage changes: agenda, list, calendar, and kanban should render the same task records differently.
- A dedicated task file can be offered as a convenience, but it should still be plain Markdown.
- Do not introduce a task database unless it is only an index/cache over Markdown.

## Canvas direction

- Keep the editor custom and small instead of embedding a full canvas suite.
- Use a retained JSON document model plus canvas/SVG rendering as needed.
- Store durable document data separately from session state, matching the snapshot idea used by mature canvas tools.
- Support export/import paths rather than adopting a heavy runtime dependency.
- Excalidraw-compatible export is the preferred interchange target because `.excalidraw` files are JSON with top-level document metadata, elements, app state, and file assets.

## UI direction

- Keep the app immediately usable: sidebar, editor, preview, split view, command palette, and diagnostics remain first-class.
- Add polish through small native-feeling affordances: clearer hover states, compact menus, focused search states, stronger theme choices, and better empty states.
- Icons should remain text/SVG/CSS-driven unless a bitmap asset is essential.

## Performance guardrails

- Measure local footprint in-app before and after feature work.
- Keep caches bounded and visible in diagnostics.
- Do not scan the whole workspace on every keystroke.
- Prefer lazy loading and streaming reads for large folders.
- Treat binary size increases as a feature cost that needs justification.

## References

- SQLite FTS5: https://sqlite.org/fts5.html
- tldraw persistence snapshots: https://tldraw.dev/docs/persistence
- Excalidraw JSON schema: https://docs.excalidraw.com/docs/codebase/json-schema

## 2026-06-24 implementation checkpoint

Completed local-first increments now include:

- Search: loaded-file search controls, current-file search reports, bounded search cache diagnostics, manual cache release, and current-file/search-result canvas boards.
- Tasks: Markdown-only task views, agenda, copy/export paths, task-file setup workflow, inbox/project/weekly/review starters, and task agenda/visible-task canvas boards.
- Canvas: lightweight JSON drawing surface, selection inspector, selected-element Markdown insertion, bounded bridge boards, Obsidian/Excalidraw export discoverability, and low-memory undo cleanup.
- UI: theme quick actions, split workflow controls, modal action polish, diagnostics cards, and command-palette discoverability.
- Memory: Local Footprint reports search cache, undo, canvas, Trash, localStorage, and runtime metrics; low-memory preset clears undo histories plus search cache.

Still intentionally deferred:

- Cloud/sync identity, sync conflict resolution, remote storage, and multi-device continuation.
- Heavy embedded drawing/search runtimes unless measurements prove they are worth the RAM and binary cost.
- Treating derived indexes or views as the source of truth.

Next local-only candidates:

- Backend streaming workspace search with cancellation and bounded worker count.
- More canvas import/export compatibility tests around `.canvas` and `.excalidraw` JSON.
- More refined empty states and command surfaces for first-run local folder setup.
