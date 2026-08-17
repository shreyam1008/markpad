# Quillpane Agent Guide

This file is the working contract for automated contributors. Read it before editing the project, then keep changes small enough to review and recover.

## Product boundary

Quillpane (formerly Markpad) is a small, private Markdown notepad and local-file viewer. Go and Wails provide the desktop boundary; the operating system supplies the webview. Notes, drafts, sessions, and history stay on the user's machine.

The public display name is separate from legacy compatibility identifiers. Until the staged rebrand in `docs/rebrand-quillpane.md` says otherwise, preserve the `markpad` config root, browser-storage keys, CLI name, package IDs, single-instance UUID, repository URL, and old redirect targets exactly.

The root application is the product that CI builds and releases. Experimental applications under `ports/` are not part of the Quillpane build, test, packaging, or release scope.

## Non-negotiable rules

- Do not introduce Electron, CEF, Tauri, a bundled browser, an account system, telemetry, sync, or a runtime cloud dependency.
- Do not add React or another component/state framework. The current frontend is direct DOM code, and removing its redundant React wrapper was intentional.
- Do not fetch executable code, styles, fonts, or document renderers at application runtime. Normal user-initiated external links are the only network-facing behavior.
- Never discard or overwrite user content to simplify a failure path. Failed save, Save As, restore, close, and recovery operations must keep the editor content recoverable.
- Never make PDF, image, ebook, office, or archive views editable. PDFs are handed to the system viewer; they are not rendered in Markpad.
- Do not add a production dependency without a measured need and an update to `BUNDLE_BUDGET.md`. Prefer the Go standard library and existing frontend packages.
- Do not weaken, skip, or delete an existing test. Add a regression test for persistence and data-loss fixes.
- Preserve unrelated work in a dirty tree. Avoid broad rewrites when a narrow change is sufficient.

## Current stack

| Layer | Technology |
|---|---|
| Desktop | Go 1.24+, Wails 2.12, native OS webview |
| Frontend | TypeScript modules and direct DOM APIs |
| Build | Bun 1.3+, Tailwind CSS 4 |
| Markdown | Marked 18 |
| Sanitization | DOMPurify 3 |
| Highlighting | highlight.js core with explicitly registered languages |
| Persistence | Local JSON session, draft files, and bounded history snapshots |
| Quality | Go test/race/vet, Bun test, TypeScript, Oxlint, Oxfmt |

Dependency versions are pinned in `frontend/package.json`, `frontend/bun.lock`, `go.mod`, and `go.sum`. Do not replace them with `latest` ranges.

## Source layout

```text
main.go                       Wails window, native menus, single instance
app.go                        Wails-bound application and filesystem methods
backend_safety.go             path, size, and binary-file guards
frontend_assets.go            production-only frontend embedding
frontend_assets_dev.go        non-production test/dev asset fallback
internal/session/session.go    session model, drafts, atomic file writes
internal/session/history.go    snapshots and pruning
frontend/index.html            Bun HTML entry
frontend/src/main.ts           static shell bootstrap and startup fallback
frontend/src/legacy-shell.txt  established application DOM shell
frontend/src/legacy-controller.ts
                              imperative UI controller; legacy, incrementally typed
frontend/src/async-queue.ts    ordered frontend persistence mutations
frontend/src/commands.ts       typed command registry and fuzzy matching
frontend/src/styles.css        application and generated utility styles
frontend/tests/                dependency-free Bun tests
.github/workflows/             clean-checkout CI and release builds
```

`frontend/dist` is generated and ignored. Production Go builds use the `production` build tag and embed that directory, so the frontend must be built first. Non-production Go tests do not depend on generated assets.

## Architecture and ownership

### Desktop boundary

`main.go` owns window configuration, menus, lifecycle hooks, CLI arguments, and single-instance behavior. `app.go` owns Wails calls, dialogs, filesystem operations, document lifecycle, and conversion from the persisted session to frontend state.

Keep pure persistence logic out of Wails code. Put it in `internal/session`, where it can be tested with `session.NewStoreAt(t.TempDir())`.

### Session domain

`internal/session` is authoritative for document metadata, drafts, favorites, recents, view modes, scroll positions, and history. Session, draft, saved-file, and snapshot writes use replacement through a temporary file.

Preserve these recovery invariants:

- An unreadable `session.json` is copied to a unique `session.corrupt-*.json` file before a clean session is saved.
- Save As does not change the document path or related session metadata until the destination write succeeds.
- Restoring history snapshots the immediate pre-restore draft before replacing it.
- Explicit discard is the only normal flow allowed to remove dirty draft content.

### Frontend

`main.ts` inserts the trusted static shell and loads the controller. `legacy-controller.ts` still owns most browser-side state and behavior. New work should extract small typed, pure modules when that makes a change testable; do not expand the monolith merely to preserve its historical shape, and do not attempt a wholesale rewrite during an unrelated fix.

The Go session is authoritative for persistent state. Browser variables provide immediate editing and view state, then synchronize through Wails bindings.

## Frontend invariants

- `renderViewer(content, active)` is the single dispatch point for Markdown, code, plain-text, PDF handoff, image, and document-card views.
- Call `saveScrollPos()` before every document switch and restore the position after loading the next document.
- Call `flushPendingDraft()` before an operation that can replace current content, including history restore and document switching.
- Sanitize Marked output with DOMPurify before assigning it to the preview DOM.
- Open only explicitly allowed external URL schemes through the Go boundary.
- Use DOM methods and `addEventListener` for interactive UI. `innerHTML` is limited to the trusted static shell, sanitized Markdown, and tightly controlled non-interactive templates.
- Keep read-only view controls hidden and guard the same operations again in Go.
- Preserve the debounced work queues: draft save 300 ms, preview render 120 ms, and outline/stat metadata 180 ms unless measurements justify a change.
- Keep syntax highlighting bounded to 2,000 lines and 200,000 characters, edit history to 80 states/1 MiB, and the quadratic diff matrix to 2,000,000 cells.

`legacy-controller.ts` currently uses `@ts-nocheck` while it is incrementally migrated. Do not use that directive in new modules. New modules must pass strict TypeScript and have focused Bun tests when they contain pure behavior.

## File and security limits

- Editable text files: 10 MiB maximum.
- Read-only local assets: 50 MiB maximum.
- History: 50 snapshots per document.
- Recent files: 10 entries.
- Binary detection scans the first 8 KiB for null bytes.
- External URL schemes: HTTP, HTTPS, and mailto only.
- Markdown HTML is sanitized before insertion.

Apply limits at the Go boundary even when the frontend also avoids an operation. Normalize user file paths with the existing canonical-path helpers, and use `isReadOnlyPath`/`fileKind` rather than duplicating extension policy in new backend methods.

## Code style

### Go

- Run `gofmt`; keep imports grouped as standard library, internal packages, then external packages.
- Return descriptive wrapped errors. Do not panic for user-controlled input or ignore persistence errors silently.
- Keep exported Wails methods narrow. Test mutations and failure paths at the session layer or root package.
- Avoid forced garbage collection or runtime tuning unless repeatable benchmarks show a net benefit.

### TypeScript and DOM code

- Use `const` by default, `let` only for mutation, and no `var`.
- Use `async`/`await` for Wails operations and surface user-facing failures in the UI.
- Cache stable DOM references; avoid repeated full-document queries in hot paths.
- Do not use inline event-handler attributes.
- Keep styles in `frontend/src/styles.css`; do not add a component or icon library for simple UI.

## Required verification

For a normal change:

```sh
make setup          # first run, or when the lockfile changes
make check          # Go + frontend tests and static checks
```

Before release or after backend/concurrency-sensitive work, also run:

```sh
go test -race -tags webkit2_41 ./...
go vet -tags webkit2_41 ./...
make check-size
```

`make check-size` must create a stripped production binary from freshly built frontend assets and enforce the documented binary ceiling; `make check` enforces the frontend ceiling. If the local machine lacks GTK/WebKitGTK development packages, run everything else and rely on the Linux CI build for the final native link; do not claim a locally measured binary result.

## Documentation and release discipline

- Document what the current code does, not what an older release or experiment did.
- Do not claim a startup time, memory footprint, or artifact size without recording the command, platform, date, and result.
- Keep `README.md`, `docs/architecture.md`, `docs/behavior.md`, `docs/dependencies.md`, `TODO.md`, and `BUNDLE_BUDGET.md` aligned with architecture or behavior changes.
- Keep version values aligned across `main.go`, packaging metadata, and release notes when preparing a release.
- Use the existing changelog UI for shipped user-visible changes; do not label unfinished work as released.
