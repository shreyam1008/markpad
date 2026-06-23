# Markpad local-first upgrade roadmap

This roadmap captures the upgrade direction for making Markpad feel more polished while keeping the app local-first, low-memory, and small enough to stay meaningfully lighter than heavyweight note apps.

## Non-negotiables

- Keep all phase-1 features local-only. No sync service, accounts, remote telemetry, or cloud dependency.
- Preserve the current strengths: split view, local files, Git-aware workflow, fast load, and low RAM use.
- Prefer plain files and inspectable data over opaque databases unless the feature clearly needs indexing.
- Do not pull large UI/editor frameworks just to copy polish. Recreate the useful behaviors in small code paths.
- Treat binary size and idle memory as product features, not afterthoughts.

## Feature backlog

1. UI polish

- Refine navigation density, hover states, keyboard affordances, status messages, and empty states.
- Add a compact command/search surface that works across notes, tasks, Trash, canvas, and workspace commands.
- Keep icons as inline SVG or CSS shapes where possible. Avoid large icon packs and raster bundles.
- Add a small set of deliberate themes: two light, two dark, one high-contrast. Persist theme locally.

2. Search

- Phase 1: search loaded/open workspace files with a lightweight in-memory index.
- Phase 1: keep exact substring search available because it handles code-like terms better than token-only search.
- Phase 1: add filters for title, path, extension, task state, Trash, backlinks, and active file context.
- Phase 2: evaluate a persistent full-text index when whole-folder search becomes necessary.

Recommended direction: start with a small custom index or a tiny browser-side library for loaded documents. MiniSearch is worth evaluating because it is designed as a small in-memory browser/Node full-text engine, but it still adds dependency surface. SQLite FTS5 is strong for persistent large-document collections, but should wait until Markpad needs a local library database and the binary-size cost is justified.

Sources:

- SQLite FTS5: https://sqlite.org/fts5.html
- MiniSearch: https://github.com/lucaong/minisearch

3. Editor and split view

- Keep the existing split feature as a signature workflow.
- Add clearer edit/preview/split controls, but keep them keyboard-friendly and visually quiet.
- Make hover actions predictable: reveal on row/card hover, never shift layout.
- Preserve fast typing by avoiding expensive full-document re-renders.

4. Trash and deletion

- Default delete should move notes/files to local Trash for 30 days.
- Permanent delete and Empty Trash must ask for confirmation.
- Trash should expose cleanup, restore, report/export, and manual empty controls.
- The file format should remain transparent enough that users can recover data without Markpad.

5. Tasks

- Store tasks in plain Markdown first, using checkbox syntax and optional metadata lines.
- Add multiple views over the same task files: list, calendar, kanban, and filtered search.
- Keep task parsing incremental and local. Do not create a separate proprietary task database unless needed.
- Support import/export so users never feel locked in.

6. Canvas

- Use a plain JSON canvas document for Markpad-owned canvases.
- Keep the model simple: nodes, edges, groups, viewport, theme, and embedded references to local files.
- Save frequently with small debounced writes. Avoid serializing huge transient UI state.
- Consider `.excalidraw` import/export later because Excalidraw documents are plaintext JSON and widely understood by users of local-first drawing tools.
- Avoid bundling full tldraw or Excalidraw unless a specific editing capability justifies the RAM and bundle-size tradeoff.

Sources:

- tldraw persistence snapshots: https://tldraw.dev/docs/persistence
- Excalidraw JSON schema: https://docs.excalidraw.com/docs/codebase/json-schema

7. Local files and workspace model

- Ask for a default save folder during setup or expose it clearly in Settings.
- Keep all primary documents portable inside that folder.
- Store local UI state separately from content state so sync can later ignore machine-specific settings.
- Add explicit import/export for workspace inventory, active file context, search results, and canvas maps.

8. Phase-2 sync boundary

- Do not code sync in phase 1.
- Shape file formats now so later sync can work by syncing folders and resolving content conflicts.
- Split content state from session state:
  - Content state: notes, task files, canvas files, attachments, Trash metadata.
  - Session state: window layout, selected theme, open panels, recent searches, viewport positions.
- Prefer appendable or conflict-tolerant formats for future shared state.

## Implementation order

1. Safety and trust: Trash confirmation, restore paths, cleanup reports, transparent exports.
2. Search polish: loaded-file index, scope filters, syntax guide, fast result rendering.
3. Workspace polish: default folder, active context exports, path actions, local-first guide.
4. Task system: Markdown task source, list/calendar/kanban views over the same data.
5. Canvas: basic JSON canvas, references to notes/tasks/search results, import/export.
6. Theme/icon pass: compact icons, local themes, refined hover and command states.
7. Performance pass: idle memory budget, large-file behavior, render throttling, debounce review.

## Performance rules

- Lazy-load expensive panels and only render visible result rows where lists can grow.
- Keep indexes scoped to loaded files until the app has a deliberate persistent index.
- Use debounced saves for local UI state and canvas state.
- Store large attachments as files, not inline JSON blobs.
- Prefer Go backend work for filesystem operations and frontend work for immediate UI feedback.
- Measure before adding heavy dependencies.
