# Architecture

Markpad is a local Wails desktop application with three deliberately small layers.

## Desktop boundary

`main.go` starts Wails, embeds the frontend, creates the native menu, and binds the Go application object. `app.go` is the desktop boundary for file dialogs, filesystem operations, external launching, note lifecycle, and conversion between persisted session data and frontend state.

Platform-specific operations belong at this boundary. Session persistence must not depend on Wails or browser state.

## Session domain

`internal/session` owns open-document metadata, drafts, favorites, recent files, preferences, scroll state, and bounded saved-version history.

Session and draft writes are atomic. Dirty drafts survive ordinary application exit. Explicitly discarding an unsaved document may remove its draft. Saved-version history is local and is not a version-control or synchronization system.

## Frontend

`frontend/index.html` provides the application shell. `frontend/src/main.js` owns the current browser-side controller and `frontend/src/styles.css` owns product-specific presentation. Generated Tailwind utilities are kept separate from handwritten styles.

All production rendering dependencies live in `frontend/vendor`. Markpad must not fetch executable code, stylesheets, fonts, or PDF resources at runtime.

## Data flow

1. Wails starts the Go application and loads or creates the session.
2. The frontend requests session state through the bound application API.
3. Editing updates browser state immediately and writes a debounced draft through Go.
4. Explicit save writes the selected file and records a bounded history snapshot.
5. Go returns authoritative note, path, dirty, history, and persistence state to the frontend.
6. Native menus emit the same commands used by visible application controls.

## Design constraints

- Local-first and usable without network access.
- Linux is the primary platform while desktop-boundary code remains portable.
- No account, telemetry, cloud synchronization, production frontend framework, or runtime CDN.
- Prefer explicit functions and narrow interfaces over service or repository layers.
- Preserve compatibility with existing v0.9 sessions and drafts.
