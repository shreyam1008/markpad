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
