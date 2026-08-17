# TODO

Markpad stays intentionally small. Reliability, recovery, and measured responsiveness take priority over new editor features.

## Completed foundation

- [x] Go + Wails desktop application using the operating system webview
- [x] Editor, Split, Preview, and syntax-highlighted Code View
- [x] Autosaved drafts, session restore, favorites, recents, and scroll/view memory
- [x] Atomic session, draft, saved-file, and history writes
- [x] Bounded edit history, history snapshots, diff work, highlighting, and file sizes
- [x] Markdown sanitization and restricted external URL schemes
- [x] Native menus, dialogs, single instance, drag and drop, and file arguments
- [x] Command palette, open-file cycling, numbered view shortcuts, and file rename
- [x] External PDF handoff and read-only local image preview
- [x] Linux binary/`.deb`, Windows NSIS, and macOS DMG workflows

## Stabilization completed for v0.9.2

- [x] Build the frontend before every clean-checkout CI and release Go build
- [x] Run full Go tests, race detector, vet, TypeScript, Bun tests, lint, format, offline-asset, and size gates
- [x] Preserve corrupt sessions and start a recoverable clean session
- [x] Protect the immediate pre-restore editor content in history
- [x] Keep Save As state unchanged when its write fails
- [x] Remove the redundant React wrapper and pin dependency versions
- [x] Bundle highlight.js core with only the available supported grammars
- [x] Debounce outline and document-stat scans while typing
- [x] Remove forced JavaScriptCore/Go runtime tuning and explicit memory reclamation
- [x] Align the README, architecture, dependency guide, behavior, roadmap, and bundle budget with current code

## Reliability next

- [ ] Add frontend behavior tests for sanitizer policy and unsafe-link handling
- [ ] Extract and test close/save/discard decisions independently of the DOM controller
- [ ] Test view availability and per-file view restoration without a live Wails process
- [ ] Add failure-injection coverage for session-save failure after successful file writes
- [ ] Add an external-file watcher with an explicit reload/keep-local decision
- [ ] Build a dependency-bundled AppImage with an executable `AppRun`, then add an install/launch smoke test
- [ ] Add scheduled dependency and vulnerability review without automatic version drift

## Maintainability

- [ ] Incrementally type `legacy-controller.ts`; do not add `@ts-nocheck` to new modules
- [ ] Extract pure Markdown rendering policy, file-type policy, and document statistics into tested modules
- [ ] Extract document lifecycle commands only when behavior tests can protect the move
- [ ] Move `ports/shreyamnotes-wails` to its own repository if that product continues

## Performance

- [ ] Add repeatable typing benchmarks using 100 KiB, 1 MiB, and 10 MiB documents
- [ ] Record cold start to interactive and total process-tree PSS on a named platform
- [ ] Profile preview parsing, sanitization, and highlighting before attempting incremental Markdown parsing
- [ ] Consider a worker or incremental document model only if measurements show the current bounded path is insufficient

## Product backlog

- [ ] Dark mode with operating-system theme detection and manual override
- [ ] Source/preview scroll synchronization for Markdown
- [ ] Export sanitized Markdown to standalone HTML
- [ ] Plain folder mode, kept separate from a knowledge-base/vault product
- [ ] Signed and notarized macOS releases
- [ ] Real release screenshots and a repeatable screenshot update process
