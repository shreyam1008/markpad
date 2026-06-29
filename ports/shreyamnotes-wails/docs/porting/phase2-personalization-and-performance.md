# Phase 2 Personalization And Performance Plan

## Guardrails

- Keep `ports/shreyamnotes-wails` isolated until benchmarks and screenshots stay clean.
- Treat Linux WebKitGTK as the memory floor. Every feature must prove it does not eagerly pull editor, markdown preview, Vim, diagram, or search chunks into startup.
- Keep package/module names and `.zennotes` vault metadata stable until the port has a migration step. Rebrand visible product surfaces first.
- Benchmark every phase against the Phase 1 harness and the 5,000-note vault.

## Web Research Decisions

- Wails embeds frontend assets and serves them through the app asset server. The app can keep using the existing Go router through `AssetServer.Handler` for local APIs.
- Wails builds should keep production tags and stripped Go binaries. On current Linux distros using WebKitGTK 4.1, keep the `webkit2_41` tag.
- Vite `modulePreload.resolveDependencies` is the right place to stop dynamic feature chunks from being preloaded into startup.
- Rollup dynamic imports must stay split. Do not inline dynamic imports, because that would execute deferred modules during startup.
- For quick code editing, do not add Monaco, Ace, or another full editor. CodeJar proves the small-editor shape can be about 2 kB and highlighter-agnostic; LDT/textarea-overlay designs keep native textarea behavior. Implement our own local textarea overlay instead of taking another dependency.
- For history, prefer shelling out to system `git` first: `git status --porcelain=v1`, `git log --follow -- <path>`, `git diff --word-diff=porcelain`, and `git show <rev>:<path>`. This keeps the Wails binary smaller than bundling libgit2 or a Go git library now.
- FFF is better saved for an optional search/index accelerator. It is native Rust/C/Node tooling, so it does not belong in the startup-critical editor path.

## Phase 2A: Visible Ownership

- Current done slice:
  - Wails shell title and menu are already `ShreyamNotes`.
  - Web document title, manifest, bridge product name, quick-capture title, help text, command palette support links, and About labels read `ShreyamNotes`.
  - About keeps a clear source-lineage card linking to `https://github.com/ZenNotes/zennotes`.
  - About points release/project links at `https://github.com/shreyam1008/shreyamnotes`.
- Remaining visible pass:
  - Hardcode the native updater owner/repo to the Shreyam GitHub release source once release publishing is wired.
  - Keep `zen` CLI/protocol labels until there is a migration plan for installed integrations.

## Phase 2B: Sidebar-First Flow

Target model:

- Favorites sit at the top of the sidebar.
- Active notes live in the sidebar as the working set.
- Closing a note removes it from active notes and moves it into recents.
- Tabs stop being the primary navigation surface.
- Keyboard shortcuts still work: search, quick switcher, next/previous active item, close active item, reopen recent.

Lowest-risk implementation order:

1. Add derived selectors for active note paths, recent note paths, and favorite paths without changing storage.
2. Render a new sidebar section for Favorites, Active, and Recents using existing tab/workspace state.
3. Hide the tab strip behind a feature flag or Wails runtime branch.
4. Convert close-tab behavior to update recents explicitly.
5. Remove tab UI only after tests cover session restore, close/reopen, split panes, pinned reference pane, and keyboard navigation.

## Phase 2C: Editor Split

Target routing:

- Markdown files keep the rich CodeMirror/preview editor.
- Code and plain text files use `LightCodeEditor`, a local component with:
  - native `<textarea>` as the real input
  - mirrored `<pre>` layer for highlights
  - tiny local tokenizers for JS/TS/JSON/CSS/HTML/Go/Rust/Python/Shell/YAML
  - tab indentation, auto indent, bracket/quote wrapping, find, line numbers
  - no package dependency, no CodeMirror import
- Binary/media assets keep the current preview path.

Performance rule:

- Opening the app or browsing the sidebar must not load CodeMirror.
- Opening a markdown note may load CodeMirror.
- Opening a code/text file must not load CodeMirror unless the user explicitly switches to the rich editor.

Implementation order:

1. Add file-kind detection in app core.
2. Add read/write local asset text endpoints in Go if current asset routes are read-only.
3. Build `LightCodeEditor` and its CSS in app core without third-party imports.
4. Route code/text files to `LightCodeEditor`.
5. Move CodeMirror imports behind a markdown-only dynamic import boundary.

## Phase 2D: Git-Backed History

History behavior:

- Each vault can opt into a hidden git repository.
- Saves create debounced checkpoints with machine/user metadata.
- The UI shows a Google Drive-like timeline per file:
  - timestamp
  - short hash
  - change summary
  - diff preview
  - restore and copy-old-version actions
- Unsaved working tree changes show as the current draft above the committed timeline.

Backend API sketch:

- `GET /history/status?path=...`
- `GET /history/log?path=...&limit=...`
- `GET /history/diff?path=...&from=...&to=...`
- `GET /history/blob?path=...&rev=...`
- `POST /history/checkpoint`
- `POST /history/restore`

Implementation order:

1. Add a small Go `history` package that validates vault-relative paths and shells out to `git`.
2. Use porcelain/status formats intended for scripts.
3. Gate checkpointing behind a vault setting.
4. Add timeline UI read-only first.
5. Add restore only after diff/blob tests cover renamed, deleted, and untracked files.

## Phase 2E: Optional Search Accelerator

- Keep built-in search and ripgrep/fzf fallback.
- Evaluate FFF only as an opt-in long-lived search index after the core Wails port is stable.
- Any FFF integration must be benchmarked for resident memory, index build time, large vault behavior, and packaging size.

## Required Evidence Per Slice

- `make wails-build`
- `go test ./...` from `apps/server`
- Relevant app-core tests for changed UI/store behavior
- Wails startup benchmark, minimum 5 runs
- 5,000-note vault benchmark after editor/sidebar/history changes
- Large-file fixture benchmark from `bench/generate-synthetic-vault.mjs`, covering
  hundreds/thousands of notes plus very large markdown and code files, with the
  Wails profile-cold run launched through
  `bench/linux-desktop-benchmark.mjs --vault <fixture>`
- Playwright screenshot of onboarding and post-skip workspace
- Console error count

## Phase 2 Evidence, 2026-06-28

- Final binary: `dist/shreyamnotes`, 23,793,320 bytes (23 MiB), built with `make wails-build`.
- Default cold start, final binary smoke: suite `phase2f-default-smoke-20260628T084507Z`, 3/3 OK, startup median/p95 `775/776 ms`, PSS median/p95 `143.0/143.1 MiB`, USS median/p95 `96.8/96.9 MiB`.
- Default cold start, 5-run baseline: suite `phase2e-default-20260628T083814Z`, 5/5 OK, startup median/p95 `770/788 ms`, PSS median/p95 `144.0/144.3 MiB`, USS median/p95 `97.3/97.5 MiB`.
- 5,000-note mixed vault with 2x16 MiB markdown and 2x16 MiB code files: suite `phase2e-vault5000-20260628T083709Z`, 5/5 OK, startup median/p95 `766/784 ms`, PSS median/p95 `179.4/182.1 MiB`, USS median/p95 `132.6/135.3 MiB`.
- Large-file metadata cap reduced the 750-note/large-file suite from a previous `318.3 MiB` median PSS to `157.7 MiB` median PSS.
- Sidebar spacer virtualization removed the 5,000-note outlier: previous P95 was `466.5 MiB` PSS; current P95 is `182.1 MiB` PSS.
- Headless Playwright QA used `http://127.0.0.1:8788`, captured desktop/mobile/onboarding/titlebar-menu/About screenshots, and reported zero console warnings/errors after the titlebar menu check.

Implemented performance controls:

- Home no longer scans every task on mount; task scan is explicit until the Tasks view is opened.
- Startup renders Home without loading the lazy markdown editor/search palette.
- Initial note prefetch skips oversized notes and caps total prefetch bytes.
- Wails note listing uses paginated `/notes/page` bridge calls.
- Server note-page requests cache a bounded per-request candidate snapshot so startup pages do not re-walk the vault repeatedly.
- Large markdown metadata reads are capped at 256 KiB during listing; full body reads still happen only when the note is opened.
- Sidebar progressive rendering uses one top spacer and one bottom spacer instead of thousands of offscreen placeholder rows.
- Standalone code/plain files route to a native textarea editor path; the rich markdown editor remains lazy and markdown-only.
- Wails web bridge now detects Wails runtime, exposes desktop app identity, and wires titlebar window controls to Wails runtime calls.

## Sources Checked

- Wails app/assets docs: https://wails.io/docs/howdoesitwork/
- Wails asset handler docs: https://wails.io/docs/guides/application-development/
- Wails build docs: https://wails.io/docs/guides/manual-builds/
- Wails Linux build tag docs: https://wails.io/docs/gettingstarted/building/
- WebKit environment variables: https://trac.webkit.org/wiki/EnvironmentVariables
- Vite module preload docs: https://vite.dev/config/build-options
- Rollup dynamic import docs: https://rollupjs.org/configuration-options/
- CodeJar reference: https://medv.io/codejar/
- LDT reference: https://github.com/kueblc/LDT
- Git log/diff/status docs: https://git-scm.com/docs/git-log, https://git-scm.com/docs/git-diff, https://git-scm.com/docs/git-status
- FFF reference: https://github.com/dmtrKovalenko/fff
