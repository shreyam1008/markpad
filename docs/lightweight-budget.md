# Markpad lightweight budget

Markpad should remain a local-first desktop app that feels polished without becoming heavy. This document turns the RAM, binary-size, and asset constraints into practical rules for future feature work.

## Targets

These are product targets, not promises for every development build:

- Keep release binaries meaningfully smaller than Electron-style note apps.
- Keep idle memory low enough that Markpad can stay open all day beside a browser and terminal.
- Keep startup fast by avoiding large frontend bundles and eager workspace scans.
- Treat clear local diagnostics as part of the product: users should be able to inspect footprint before cleanup.

## Dependency rules

- Do not add a large package for one UI interaction.
- Prefer small custom code for bounded features such as split presets, task filters, and loaded-file search.
- Use Go for filesystem-heavy work and browser code for immediate UI feedback.
- Add a dependency only when the measured feature value beats the added binary, RAM, build, and security cost.
- If a dependency is added, document why a smaller local implementation was not enough.

## Asset rules

- Prefer text glyphs, CSS shapes, and small inline SVG using `currentColor`.
- Avoid icon fonts, broad icon packs, bundled image theme packs, and large raster assets.
- Inline SVG toolbar icons should stay decorative under labeled buttons using `aria-hidden` and `focusable="false"`.
- Keep generated platform icons in packaging assets only; do not load them into the running UI unnecessarily.
- Prefer CSS variables for themes instead of image backgrounds.
- Any bitmap added to the app should have a clear reason, compressed size, and runtime load path.

## Search rules

- Loaded-file search should stay in memory and bounded to open/cached documents.
- Local-folder search should rely on the Go backend and avoid opening every file for fuzzy-only queries.
- Persistent full-text indexes are a phase-2 decision and should ship only with a clear file-size and RAM budget.
- Exact search must remain available for paths, code-like terms, and literal Markdown tokens.

## Task rules

- Markdown checkbox lines remain the task source of truth.
- List, calendar, kanban, ICS, CSV, JSON, Todo.txt, and canvas boards are derived views or exports.
- Do not create a hidden task database in phase 1.
- Keep task parsing incremental and source-scoped.

## Canvas rules

- Markpad canvas files are plain JSON using the `markpad-canvas-v1` format.
- Canvas bridges should cap inserted cards so a search/task/workspace map cannot freeze the UI.
- Store large attachments as files, not inline JSON blobs.
- Save content state separately from transient view/session state.
- Do not bundle tldraw, Excalidraw, or another full drawing runtime unless a measured editing requirement justifies it.

## UI rules

- Polish should come from spacing, typography, hover states, command discoverability, and predictable layout, not heavy frameworks.
- Theme additions should be CSS-variable-only.
- Theme badges should use text and CSS pseudo-elements rather than icon fonts or image assets.
- Theme choice controls should expose active pressed state without adding a runtime theme engine.
- Split/edit controls should remain keyboard-accessible, expose view and preset pressed/active state, and work without modal-heavy workflows.
- Formatting controls should use labeled toolbar semantics and pressed state for local editor toggles.
- Empty states and guides should explain local behavior instead of hiding complexity behind opaque automation.

## Cleanup and diagnostics

- Keep local footprint, runtime stats, and undo-cleanup commands visible in the command palette.
- Prefer bounded reports over background telemetry.
- Memory cleanup should be explicit: clear undo history, compact UI, cap canvas inserts, and avoid full-folder eager loads.
