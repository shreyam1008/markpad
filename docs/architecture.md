# Architecture

Quillpane (formerly Markpad) is a local Wails desktop application with three deliberately small layers.

## Desktop boundary

`main.go` starts Wails, embeds the frontend, creates the native menu, and binds the Go application object. `app.go` is the desktop boundary for file dialogs, filesystem operations, external launching, note lifecycle, and conversion between persisted session data and frontend state.

Platform-specific operations belong at this boundary. Session persistence must not depend on Wails or browser state.

`updates.go` performs an on-demand, timeout-bounded GitHub stable-release check from Help. It sends no document data. Installer downloads are bounded by the release asset size and checked against its SHA-256 digest before installation. A clean session is required; Windows hands the verified setup to a detached wait-for-exit helper, and Linux updates the current portable executable or package with authorization when needed, then restarts the app. Store-managed installations keep their store update path. Preview selections and Copy Path use the Wails native clipboard; preview keyboard copy also handles webviews that omit DOM clipboard events.

## Session domain

`internal/session` owns open-document metadata, drafts, favorites, recent files, preferences, scroll state, bounded saved-version history, and the content fingerprint last opened or saved for each source file.

Session and draft writes are atomic. Dirty drafts survive ordinary application exit. Explicitly discarding an unsaved document may remove its draft. The active saved source can be checked read-only from the frontend on a bounded interval; this surfaces external modification, deletion, replacement, or an unverifiable legacy baseline without changing the draft. Normal saves still stream-hash the current source and stop before writing. Explicit conflict reload preserves the Quillpane draft and reloaded source in history first. Saved-version history is local and is not a version-control or synchronization system.

## File safety

`delete_path.go` validates permanent deletion targets. Only already-open saved documents may be deleted after confirmation; directories, unsafe paths, and symlinks are rejected. No folder scanner, index, or persisted workspace root remains. Old session roots are ignored without discarding documents.

## Frontend

`frontend/index.html` is the Bun HTML entry point. React and TypeScript components under `frontend/src` own the browser-side controller. CodeMirror 6 owns incremental source editing and source undo/redo, while `DocumentWorkspace` keeps drafts and persistence authoritative and retains bounded snapshot history for textarea documents. Tailwind provides layout and component styling; handwritten CSS is limited to the editor, rendered Markdown, code blocks, split geometry, and accessibility behavior.

Bun bundles all production dependencies into `frontend/dist`, and Go embeds only that generated directory. All executable code, stylesheets, fonts, and document-rendering resources remain local. Windows defers the embedded classic Mermaid script until a diagram opens. Linux/macOS retain the single-module build for WebKit compatibility. Large plain-text and unhighlighted code previews use newline-aligned blocks with offscreen layout containment; the entire text remains available to selection. Highlight grammars initialize on first use; syntax-limit checks stop without splitting all lines. Word counts, line navigation, and find avoid allocating a string or match array for every line or hit.

## Data flow

Opt-in Markdown task files use pure source-offset transforms in `workspace/tasks.ts`
and a focused `TaskDocument` view. Categories, completion and Trash persist in the
Markdown source. All mutations pass through the existing document history and
draft/save boundary; there is no task database or backend format change. Grouping
and ordering lookups are linear in the bounded task count. Input undo stays local
to text fields, while committed task changes use document undo and recovery drafts.

1. Wails starts the Go application and loads or creates the session.
2. The frontend requests session state through the bound application API.
3. Editing updates browser state immediately and writes a debounced draft through Go.
4. Explicit save writes the selected file and records a bounded history snapshot.
5. Go returns authoritative note, path, dirty, history, and persistence state to the frontend.
6. Native menus emit the same commands used by visible application controls.

## Design constraints

- Local-first and usable without network access.
- Linux is the primary platform while desktop-boundary code remains portable.
- No account, telemetry, cloud synchronization, component suite, or runtime CDN.
- Prefer explicit functions and narrow interfaces over service or repository layers.
- Preserve existing sessions and recovery drafts, including sessions with obsolete folder metadata.
