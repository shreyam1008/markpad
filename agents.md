# Markpad Agent Guide

> This is the source of truth for agents working on Markpad. Read it completely before changing the repository.

## Product identity

Markpad is a small, native, local-first Markdown notepad and folder workspace built with Go, Wails v2, and the operating-system webview. It should feel immediate like a traditional notepad while providing live Markdown preview, recovery drafts, saved-version history, fast file navigation, and bounded folder search.

Plain files remain the source of truth. Markpad has no account, cloud service, telemetry, sync engine, or runtime network dependency.

## Hard constraints

| Rule | Reason |
|---|---|
| No Electron, CEF, Tauri, or bundled browser engine | Use the OS webview and keep release artifacts small. |
| Production binary must remain below its platform ceiling | `make check-size` gates Linux at 16 MiB; the release workflow gates Windows at 16.1 MiB. |
| No cloud client, telemetry, account, or external API | User content stays local and private. |
| No runtime CDN, remote script, stylesheet, font, or renderer | The installed app must work offline. |
| No component suite or general state-management package | Prefer the existing React components, reducer, and narrow helpers. |
| Avoid new Go dependencies | Prefer the standard library; Wails is the only direct Go dependency. |
| Pin direct frontend dependencies and commit `bun.lock` | Clean builds must be reproducible. |
| Never silently discard or overwrite unsaved content | Dirty-state warnings and explicit confirmation are safety boundaries. |
| Never weaken or delete tests to make a change pass | Add or improve coverage instead. |
| Do not create files without a clear owner or purpose | Use the existing structure and documentation. |

Read `BUNDLE_BUDGET.md` before adding a dependency or allocation-heavy feature.

## Technology

| Layer | Technology |
|---|---|
| Desktop | Go 1.24+, Wails v2, native menus/dialogs, OS webview |
| Frontend | React 19, strict TypeScript, HTML entry point |
| Build and tests | Bun 1.3.14, Bun bundler/test runner, TypeScript |
| Styling | Tailwind CSS 4 plus focused CSS in `frontend/src/styles.css` |
| Markdown | Marked, DOMPurify, highlight.js |
| Icons | Statically imported Lucide icon nodes |
| Persistence | Go JSON session, drafts, and bounded history in the app config directory |

Bun bundles browser dependencies into `frontend/dist`. Go embeds only that generated directory. Bun, TypeScript, tests, source maps, and `node_modules` are not part of the release runtime.

## Repository map

```text
main.go                         Wails startup, menus, window, single-instance behavior
app.go                          Main desktop API and document lifecycle
backend_safety.go               Filesystem/URL safety helpers
frontend_assets.go              Embeds frontend/dist
internal/session/               Session, draft, history, and atomic file persistence
internal/workspace/             Bounded folder scan, search, creation, and path safety
frontend/
  index.html                    Bun HTML entry point
  build.ts                      Typed, minified production bundle
  src/App.tsx                   Application orchestration and desktop commands
  src/commands.ts               Reusable fuzzy matcher/command registry
  src/components/               Sidebar, palette, editor workspace, history, icons
  src/preview/                  Sanitized Markdown and bounded code rendering
  src/workspace/                Typed desktop client, document rules, reducer, API types
  tests/                        Bun unit tests
docs/                           Product, architecture, behavior, packaging, and website
packaging/ and snap/            Platform packaging metadata and icons
```

## Frontend conventions

Read `DESIGN.md` before any visual or interaction change. It is the source of truth for semantic tokens, fixed shell geometry, no-layout-shift rules, window chrome, syntax colors, assets, motion, and visual QA.

- Keep TypeScript strict; do not add `any` to bypass API modeling.
- `App.tsx` coordinates desktop commands and application-level state. Put cohesive UI in `components/` and pure document logic in `workspace/` or `preview/`.
- `workspace/state.ts` is the reducer-owned browser state. Go session state remains authoritative for persisted document and workspace metadata.
- Use hooks at component scope with complete, stable dependency lists. Clean up timers and runtime subscriptions.
- Keep keyboard actions and native-menu events routed through the same callbacks as visible UI controls.
- Use semantic controls, labels, focus restoration, and keyboard navigation. Do not add clickable non-interactive elements.
- Do not use unsanitized HTML. Markdown output goes through Marked and DOMPurify; syntax highlighting is bounded.
- Preserve selection and editor/viewer scroll before switching documents. Workspace search results must select and reveal the exact match.
- Add styling to `frontend/src/styles.css`; avoid ad hoc inline styles except dynamic values that CSS cannot know.
- Statically import only required Lucide icon nodes so unused icons are removed from the bundle.
- Browser code must not fetch production dependencies or user content over the network.

## Desktop and Go conventions

- Keep platform dialogs, Wails events, external launching, and session conversion at the desktop boundary.
- Keep session and workspace algorithms independent from Wails so they can be tested directly.
- Normalize and validate filesystem paths before reads, writes, renames, creation, or deletion.
- Use atomic replacement for persisted session, draft, history, and user-file writes.
- Return descriptive errors; never panic for user input or ordinary filesystem failure.
- Read-only families (PDF, image, ebook, office, archive) never expose edit/save actions. PDFs use the OS viewer rather than a bundled renderer.
- Never follow a workspace symlink or allow a create/delete path to escape the selected root.
- Saved-file deletion is permanent and requires frontend confirmation. That warning must state when unsaved edits will also be lost. The backend refuses directories, unsafe paths, symlinks, and files that are neither supported workspace members nor already-open saved files.

## Workspace Lite contract

Markpad may persist one selected folder. It does not import files or create a database/index.

- The inventory contains supported regular text files plus visible extensionless text files such as `README` and `Makefile`, ordered deterministically by relative path.
- `Ctrl+P` searches open documents, workspace filenames/paths, and actions with the existing lightweight fuzzy matcher.
- `Ctrl+Shift+F` runs case-insensitive exact content search and returns relative path, line, snippet, and match offsets. Opening a result selects and reveals the exact occurrence.
- Refresh, change, and clear are explicit. External changes become visible after refresh; there is no watcher.
- New workspace files may use `.md`, `.markdown`, `.mdx`, or `.txt`; a missing extension becomes `.md`; existing files are never overwritten.
- Unsaved Markdown/text drafts may be filed into the selected folder through the same document lifecycle; the suggested relative path is title-derived and collision-aware, while the backend remains the no-overwrite authority.
- Hidden paths and the directories `build`, `coverage`, `dist`, `node_modules`, `obj`, `out`, `target`, and `vendor` are excluded.
- Scan caps: 10,000 included files, 100,000 visited entries, 2 MiB per file, and depth 32.
- Search caps: 64 MiB per query, 200 results, 256 query runes, and 400 preview runes.
- Do not add persistent indexing, filesystem watchers, multiple workspaces, backlinks, a graph, Git integration, or a Markpad metadata folder unless separately approved.

## File behavior

| Family | Behavior |
|---|---|
| Markdown (`md`, `markdown`, `mdx`) | Editor, Split, Preview; formatting toolbar |
| Code/config | Editor and bounded syntax-highlighted Code View |
| Text/log/CSV | Editor and plain Viewer |
| Image | Local inline preview; read-only |
| PDF | Read-only handoff to the operating-system viewer |
| Ebook/office/archive | Read-only information card and external handoff |

Saved files default to Viewer; new drafts default to Editor. View, cursor, editor scroll, and viewer scroll survive document switches where supported.

## Persistence and safety

- Session: `{config_dir}/markpad/session.json`
- Drafts: `{config_dir}/markpad/drafts/{id}.md`
- History: `{config_dir}/markpad/history/{doc-id}/{timestamp}.json`
- Saved-version history: at most 50 snapshots per document
- Browser edit history: at most 80 states and 1,000,000 characters
- Images: at most 50 MiB through the desktop boundary
- Highlighted source: at most 200,000 characters or 2,000 lines

Normal exit preserves dirty drafts. An explicit discard or confirmed permanent file deletion may remove recovery content only after user choice. A corrupt session must be preserved for recovery rather than overwritten silently.

Saved documents persist a content fingerprint for the source last opened or saved. A normal save must stop on an external modification, replacement, deletion, or unverifiable legacy baseline. Reload protects the Markpad draft in saved-version history before adopting disk content; overwrite/recreate remains an explicit user choice.

## Commands and verification

From a clean checkout:

```sh
make setup          # bun install --frozen-lockfile
make check          # frontend build/tests/lint/format, Go tests, assets, release size
make build          # stripped production Linux binary
```

The canonical Go suite is:

```sh
go test -tags production,webkit2_41 . ./internal/... ./tests
```

This intentionally excludes ignored local experiments such as `ports/` while covering the root backend, session/workspace packages, and integration tests.

Before committing:

1. Run focused tests while developing.
2. Run `make check` and read the complete output.
3. Run `git diff --check` and inspect `git diff` for unrelated changes.
4. Smoke-test affected native behavior when feasible; tests do not prove file-dialog or packaging UX.

## Performance and dependency rules

- Production binary hard ceilings: 16 MiB on Linux and 16.1 MiB on Windows; keep ordinary startup work bounded.
- Markdown render debounce: 120 ms; draft persistence debounce: 350 ms.
- Keep scans/search cancellable or bounded so rapid input cannot display stale results or block typing.
- Prefer standard-library directory walking and streaming/bounded reads over a database or search daemon.
- Before adding a package, document its need, installed/runtime size, offline behavior, and simpler alternatives in `BUNDLE_BUDGET.md` and `docs/dependencies.md`.

## Release process

1. Synchronize `X.Y.Z` in `main.go`, `frontend/package.json`, `snap/snapcraft.yaml`, `packaging/macos/Info.plist`, AppStream metadata, the website schema, About/Changelog UI, README, and TODO/roadmap.
2. Ensure every CI/release job installs Bun 1.3.14, runs `bun install --frozen-lockfile`, and builds `frontend/dist` before any Go command that compiles `frontend_assets.go`.
3. Run `make setup`, `make check`, `git diff --check`, and relevant native smoke tests from clean state.
4. Confirm Windows `.ico` resources/installer icon and macOS `.icns` bundle icon are present.
5. Commit and push `main`; wait for CI to pass.
6. Create an annotated tag and push only that tag: `git push origin vX.Y.Z`. Never use `git push --tags`; historical local and remote tags may differ.
7. Verify the GitHub release contains the Linux binary, `.deb`, AppImage, Windows installer, macOS DMG, and macOS ZIP.
8. Generate Scoop/WinGet hashes and Flatpak commit references only after release artifacts exist. Do not commit placeholder store manifests as if they were publishable.

## Version history

| Version | Highlights |
|---|---|
| 0.13.1 | WebKitGTK-safe production bundle and native rendered-window release smoke test |
| 0.13.0 | Incremental CodeMirror editing, lazy language modes, bounded local Markdown images, wrapped-note navigation |
| 0.12.0 | Responsive code/text viewers, keyboard settings, interface scale, dark-theme contrast, fresh screenshots |
| 0.11.0 | Strict design system, custom window chrome, stable overlays, modern Markdown/Mermaid, Git-style history diffs, unified assets |
| 0.10.0 | Typed React workspace, command palette, Workspace Lite folder navigation/search, confirmed saved-file deletion |
| 0.9.0 | Packaging and distribution groundwork |
| 0.8.0 | Sidebar outline and memory tuning |
| 0.7.0 | Scroll restoration, highlighting, history, performance |
| 0.6.0 | Single instance, image preview, file information |
| 0.1.0–0.5.0 | Core editor, split preview, recovery drafts, session, file verticals |
