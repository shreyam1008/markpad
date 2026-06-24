# Architecture

Markpad is a lightweight local-first desktop app built with Go and Wails.

The current architecture is intentionally simple:

- Go/Wails backend: top-level `*.go` files expose native file, session, local-folder, Trash, task, runtime, and canvas helpers to the webview.
- Session core: `internal/session` owns durable session metadata, drafts, bookmarks, preferences, and atomic file persistence tests.
- Frontend shell: `frontend/index.html`, `frontend/src/main.js`, and `frontend/src/styles.css` implement the sidebar, split editor/preview, command palette, search, tasks, Trash, canvas, diagnostics, and themes.
- Packaging: `Makefile`, `build/`, and `packaging/` define local builds and release packaging.

## Local-first boundaries

- Markdown and user-selected files are the source of truth for notes.
- Markdown task lines are the source of truth for tasks; list, calendar, and kanban are projections.
- Canvas content is portable JSON; camera, tool, grid, snap, and minimap are device-local session state.
- Search indexes and diagnostics are derived state, not canonical content.
- Trash is local metadata plus recoverable draft/file content with explicit retention controls.
- Sync/cloud is a future layer over these formats, not part of the current phase.

## Runtime model

The app has one native Wails window and one webview frontend. Avoid adding additional embedded browser surfaces unless profiling proves it is necessary.

Memory should be measured in three planes:

- Go heap/runtime metrics from `GetRuntimeStats`.
- WebView/JavaScript memory through browser/devtools profiling when available.
- OS process-tree RSS, including WebKit helper processes.

## Validation model

The local validation checkpoint is:

```sh
make validate
```

That expands to core tests, full Go tests, production-tag Go tests, `go vet`, frontend syntax checking, and production-style build.

CI should mirror these checks so the long-running upgrade does not drift from buildable, testable, lightweight behavior.

## Performance notes

- Keep the binary small by avoiding bundled image packs, font icon packs, heavy JS runtimes, source maps, and WASM unless measured.
- Keep canvas rendering bounds-first and viewport-cullable; do not persist cached bounds or raster previews into portable canvas files.
- Keep search bounded and diagnostic-rich; future FTS indexes must be rebuildable sidecars.
- Keep task and Trash views metadata-aware and exportable without becoming separate canonical stores.
