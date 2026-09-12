# Architecture

Quillpane (formerly Markpad) is a local Wails desktop application with three deliberately small layers.

## Desktop boundary

`main.go` starts Wails, embeds the frontend, creates the native menu, and binds the Go application object. `app.go` is the desktop boundary for file dialogs, filesystem operations, external launching, note lifecycle, and conversion between persisted session data and frontend state.

Platform-specific operations belong at this boundary. Session persistence must not depend on Wails or browser state.

`updates.go` performs an on-demand, timeout-bounded GitHub stable-release check from Help. It sends no document data. Installer downloads are bounded by the release asset size and checked against its SHA-256 digest before the OS installer opens. Linux replaces the current portable executable atomically, or uses system authorization to update the installed binary/package; it does not create another PATH copy. The editor never quits automatically. Store-managed installations keep their store update path. Preview selections and Copy Path use the Wails native clipboard; preview keyboard copy also handles webviews that omit DOM clipboard events.

## Session domain

`internal/session` owns open-document metadata, drafts, favorites, recent files, preferences, scroll state, bounded saved-version history, and the content fingerprint last opened or saved for each source file.

Session and draft writes are atomic. Dirty drafts survive ordinary application exit. Explicitly discarding an unsaved document may remove its draft. Normal saves stream-hash the current source and stop on an external modification, deletion, replacement, or unverifiable legacy baseline. Explicit conflict reload preserves the Quillpane draft in history first. Saved-version history is local and is not a version-control or synchronization system.

## Workspace domain

`internal/workspace` owns local-folder path validation, deterministic scanning, exact content search, collision-safe file reservation, and deletion-target validation. Filing a recovery draft reserves a safe workspace path, then reuses the ordinary session save lifecycle. It uses the standard library and no database or persistent index.

The selected workspace root is persisted with session state. Scan and search results are derived, bounded data: at most 10,000 included files, 100,000 visited entries, 32 levels, 2 MiB per file, 64 MiB searched per query, and 200 returned matches. Hidden paths, symlinks, and generated/dependency folders are excluded.

## Frontend

`frontend/index.html` is the Bun HTML entry point. React and TypeScript components under `frontend/src` own the browser-side controller. CodeMirror 6 owns incremental source editing and source undo/redo, while `DocumentWorkspace` keeps drafts and persistence authoritative and retains bounded snapshot history for textarea documents. Tailwind provides layout and component styling; handwritten CSS is limited to the editor, rendered Markdown, code blocks, split geometry, and accessibility behavior.

Bun bundles all production dependencies into `frontend/dist`, and Go embeds only that generated directory. Quillpane must not fetch executable code, stylesheets, fonts, or document-rendering resources at runtime.

## Data flow

1. Wails starts the Go application and loads or creates the session.
2. The frontend requests session state through the bound application API.
3. Editing updates browser state immediately and writes a debounced draft through Go.
4. Explicit save writes the selected file and records a bounded history snapshot.
5. Go returns authoritative note, path, dirty, history, and persistence state to the frontend.
6. Native menus emit the same commands used by visible application controls.
7. Workspace refresh replaces the bounded derived inventory; opening a result rejoins the normal document/session flow.

## Design constraints

- Local-first and usable without network access.
- Linux is the primary platform while desktop-boundary code remains portable.
- No account, telemetry, cloud synchronization, component suite, or runtime CDN.
- Prefer explicit functions and narrow interfaces over service or repository layers.
- Preserve compatibility with existing v0.9 sessions and drafts while adding optional v0.10 workspace state.
