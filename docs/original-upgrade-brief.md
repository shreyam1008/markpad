# Markpad original upgrade brief

This document preserves the long-running upgrade direction so future sessions do not lose context.

## Product goal

Upgrade Markpad as a local-first Wails Markdown workspace that feels more refined while staying lightweight in RAM, binary size, and dependencies.

Markpad should keep its identity:

- Tiny native Go/Wails app, not Electron.
- Local-first by default; no sync/cloud in this phase.
- Markdown files and portable JSON remain source-of-truth formats.
- Split editor/preview, sidebar, local files, Git-oriented workflows, tasks, search, Trash, and canvas are core product strengths.

## Reference inspiration

The reference app is more polished but too heavy for Markpad's target. Markpad should borrow useful interaction patterns, not its runtime weight.

Specific external inspiration mentioned:

- tldraw: https://tldraw.dev/
- tldraw repo: https://github.com/tldraw/tldraw
- infinipaint: https://github.com/ErrorAtLine0/infinipaint
- Excalidraw: https://github.com/excalidraw/excalidraw

Use these as design and format references only. Do not bundle heavy drawing runtimes unless profiling later proves the native canvas cannot meet the UX target.

## Phase 1 scope: local only

- Strong loaded-file and local-folder search.
- Refined search UI, query syntax, diagnostics, and result provenance.
- Multiple CSS-only themes, light and dark.
- Lightweight icon/assets strategy: text icons, inline SVG only where justified, no font icon packs.
- Better split/edit/preview ergonomics and discoverability.
- Trash with 30-day retention, restore, cleanup profile, and reports.
- Markdown task file projections: list, calendar, kanban, export formats.
- Lightweight infinite-canvas style drawing with portable JSON, viewport culling, bounded undo, minimap, and interop exports.
- Runtime, asset, search, task, layout, canvas, and Trash diagnostics as first-class polish.

## Phase 2 scope: planned, not coded now

- Sync/cloud layer over existing files and metadata.
- Device handoff between computers.
- Rebuildable indexes and caches that never become the source of truth.
- Possible CRDT/storage upgrades only after local-first formats and profiling are stable.

## Operating model

Stabilization first:

- Build the app.
- Run automated tests.
- Run frontend syntax checks.
- Run the app.
- Measure binary size and baseline RSS.
- Inspect UI/UX directly where the environment permits.
- Document guardrails before resuming aggressive feature work.

Parallel agents:

- Main coordinator: integration, commits, scope control.
- Zoro: lightweight icons/assets and visual polish.
- Sanji: task/split UI polish.
- Chopper: build and app-run validation.
- Usopp: tests, code quality, folder organization.
- Nami: RAM/perf/startup/UI bottlenecks.
- Robin: primary-source research and architecture guidance.

Commit strategy:

- During recovery, commit stabilization fixes and guardrail docs separately.
- After baseline is stable, return to small end-to-end feature slices with clean commits.

## Non-goals for this phase

- No Electron-sized runtime.
- No cloud sync implementation.
- No heavy icon/font/image packs.
- No full tldraw/Excalidraw runtime dependency.
- No task database that replaces Markdown.
- No search index that becomes canonical content.
