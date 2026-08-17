# Architecture

Markpad is a local Wails desktop application with three intentionally narrow layers.

## Desktop boundary

`main.go` configures the Wails window, native menus, lifecycle hooks, CLI file arguments, and single-instance behavior. `app.go` is the bound desktop API for file dialogs, filesystem operations, external launching, note lifecycle, and conversion from persisted session data to frontend state.

`backend_safety.go` and `url_policy.go` centralize path, file-size, binary-file, and external-URL guards. Platform-specific operations stay at this boundary; session persistence does not depend on Wails.

Production builds use the `production` tag. `frontend_assets.go` then embeds the generated `frontend/dist` directory. Non-production builds use `frontend_assets_dev.go`, allowing backend tests to compile from a clean checkout while Wails provides the live development server.

## Session domain

`internal/session` owns open-document metadata, drafts, favorites, recents, preferences, view and scroll state, and bounded saved-version history. It is pure Go and is tested against temporary stores.

Session, draft, snapshot, and saved-file writes use a synced temporary file and same-directory replacement. This provides rename atomicity where the operating system supports it, but does not claim full power-loss durability on every platform. The domain preserves three explicit recovery rules:

- Invalid session JSON is copied to a unique recovery file before a clean session is initialized.
- Save As does not mutate the live document until the destination and recovery-draft writes succeed.
- History restore snapshots the current recovery draft before replacing it.

History is local recovery data, not synchronization or version control.

## Frontend

`frontend/index.html` loads `frontend/src/main.ts`. The entry inserts the trusted static shell from `legacy-shell.txt`, loads styles, and starts `legacy-controller.ts`. The controller owns editor state, views, preview rendering, commands, shortcuts, close flows, and synchronization with Go. `async-queue.ts` orders draft mutations so autosave cannot overtake save or restore; `commands.ts` contains the typed, dependency-free command registry and fuzzy matching.

The controller remains imperative and uses `@ts-nocheck` while it is incrementally cleaned up. New pure behavior should move into small strict TypeScript modules with Bun tests. A component framework is not needed for the current product.

Bun type-checks and bundles all production packages into `frontend/dist`. Tailwind is compiled at build time. Marked parsing, DOMPurify sanitization, and highlight.js core plus selected languages are all local; the desktop application has no runtime CDN.

## Data flow

1. Wails starts the Go application and loads or recovers the session.
2. The frontend requests authoritative session metadata and the active recovery draft through bound methods.
3. Editing updates the textarea immediately. Preview rendering and metadata work are debounced; draft content is persisted through Go.
4. Explicit save writes the source file and records bounded history. Save As commits the new path only after the write succeeds.
5. A restore flushes the current editor buffer, snapshots that pre-restore content, then replaces the recovery draft.
6. Go returns authoritative note, path, dirty, history, and persistence state for the frontend to render.
7. Native menus emit the same commands used by visible controls.

## Design constraints

- Local-first and functional without network access.
- System webview; no Electron or bundled Chromium.
- No account, telemetry, cloud synchronization, component suite, or icon package.
- Editable files are capped at 10 MiB; read-only assets at 50 MiB.
- Expensive frontend work and history growth are explicitly bounded.
- Prefer narrow functions and typed pure modules over new service layers or a wholesale rewrite.
- Preserve compatibility with existing v0.9 sessions and drafts.

## Repository scope

Only the root application is covered by this architecture and by release CI. `ports/shreyamnotes-wails` is a separate experimental product and should be extracted to its own repository if maintained further.
