# Markpad local upgrade roadmap

This roadmap keeps the app local-first, small, and memory-conscious while borrowing the refined behaviors users expect from heavier note apps.

## Search direction

- Phase 1: keep loaded-note search in the renderer because the notes are already in memory.
- Phase 1: keep local-folder search bounded, line-oriented, and dependency-free: skip hidden folders, common binary extensions, oversized files, and large snippets.
- Phase 1: expose visible search diagnostics: scope, loaded/local count, skipped files, match count, and elapsed time.
- Phase 1: keep last-run search telemetry in renderer state only, then surface it in the result strip, Search Profile, and exports.
- Phase 2: add an optional SQLite FTS5 index for large folders, preferably external-content/contentless style so the Markdown source is not duplicated unnecessarily.
- Avoid bundling ripgrep as a dependency for now. Copy the useful behavior: gitignore-aware defaults, binary skipping, and line-oriented snippets.

References:

- SQLite FTS5: https://sqlite.org/fts5.html
- ripgrep: https://github.com/BurntSushi/ripgrep

## Canvas direction

- Phase 1: keep the current canvas as plain JSON with deterministic, portable records.
- Phase 1: separate document data from view/session data so future sync can merge content without fighting camera/selection state.
- Phase 1: export/import a stable Markpad canvas JSON format and include an adapter path for `.excalidraw`-style scene export later.
- Phase 2: consider optional compatibility exports, not a runtime dependency on a heavy canvas package.
- Avoid shipping a full infinite-canvas framework in the binary until profiling proves the current canvas cannot meet the UX target.

References:

- tldraw persistence: https://tldraw.dev/docs/persistence
- Excalidraw JSON schema: https://docs.excalidraw.com/docs/codebase/json-schema

## UI direction

- Keep the left sidebar and split editor/preview as Markpad's signature flow.
- Make advanced tools discoverable through compact panels instead of permanent chrome.
- Prefer text labels plus tiny CSS icons over image assets.
- Give every local-first feature a visible source/provenance hint so users understand where data lives.
- Treat diagnostics as user-facing polish: search profile, task source profile, canvas profile, layout profile, and asset profile should all be copy/export friendly.

## Storage direction

- Markdown remains the source of truth for notes and tasks.
- Trash remains local metadata plus files, with explicit retention and cleanup controls.
- Canvas documents use portable JSON next to the selected Markpad folder.
- Phase 2 sync should operate above these formats, not replace them.
