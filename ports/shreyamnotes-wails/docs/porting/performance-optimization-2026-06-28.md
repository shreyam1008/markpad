# Performance Optimization Log - 2026-06-28

Scope: ShreyamNotes Wails/WebKitGTK port after the Bun/package upgrade.

## Goal

| Metric | Target | Final |
| --- | ---: | ---: |
| Default PSS median/p95 | <=155 / <=165 MiB | 127.8 / 128.0 MiB |
| 5k-large-vault PSS median/p95 | <=190 / <=200 MiB | 161.8 / 162.1 MiB |
| Default startup median/p95 | <=700 / <=725 ms | 454 / 500 ms |
| 5k-large-vault startup median/p95 | <=700 / <=725 ms | 431 / 489 ms |
| Wails binary size | <=24,800,000 bytes | 24,629,288 bytes |
| Embedded web dist size | <=14,600,000 bytes | 14,542,512 bytes |

Status: passed on the final rebuilt Wails binary.

## Starting Point

Package-upgrade final baseline:

| Metric | Value |
| --- | ---: |
| Build wall time | 7.07 s |
| Peak build RSS | 956,872 KiB |
| Binary size | 24,637,480 bytes |
| Embedded web dist size | 14,555,221 bytes |
| Default startup median/p95 | 701 / 708 ms |
| Default PSS median/p95 | 174.3 / 176.7 MiB |
| 5k-large-vault startup median/p95 | 709 / 714 ms |
| 5k-large-vault PSS median/p95 | 208.9 / 212.1 MiB |

## Changes

### Startup Chunk Diet

- Lazy-load the PDF export window from `apps/web/src/main.tsx` so normal Wails startup does not import the export-only React tree.
- Lazy-load workspace-only `Sidebar`, `NoteList`, and `HomeView` from `packages/app-core/src/App.tsx`.
- Put Vite's virtual preload helper in its own neutral chunk.
- Split `dompurify` into `vendor-sanitize` so normal markdown rendering does not pull the Mermaid vendor chunk just to sanitize HTML.
- Lazy-load the full `App` shell from `packages/app-core/src/main.tsx` so quick-capture, floating note, and external-file windows do not eagerly import the normal workspace shell.
- Split lightweight Excalidraw path predicates into `@shared/excalidraw-path`, keeping LZ-string Obsidian decompression out of the store/sidebar startup path.

### First-Run Light Boot

- `apps/web/src/main.tsx` now installs the bridge/service worker first and dynamically imports the full app only when needed.
- Fresh default vaults render a tiny first-run shell before loading the full React workspace. Explicit vault paths, quick capture, floating windows, and external files still load the full app immediately.
- Removed manifest/apple-touch eager references from `apps/web/index.html` to avoid WebKit fetching/decoding them during the cold path.
- Replaced the startup `package.json` import in `apps/web/src/bridge/http-bridge.ts` with fixed app metadata constants.

### Large-Vault Memory

- Added byte-aware note prefetch limits in `packages/app-core/src/store.ts`.
- Skipped initial visible-note prefetch for vaults above 1000 notes.
- Skipped sidebar edge/visible-note prefetch for vaults above 1000 notes.
- Kept sidebar virtualization thresholds at the stable values after testing lower thresholds and seeing worse WebKit memory.
- Avoided startup sidebar autofocus for vaults above 1000 notes so the virtual list stays active.
- Trimmed the Go vault metadata cache after the final large note-list page and called `debug.FreeOSMemory()` for large lists.

### Yellow-Screen Regression

- Root cause: an overly broad Vite manual chunk predicate treated any path containing the string `react` as React core. That pulled `@floating-ui/react` into the `vendor-react` chunk while related Floating UI/Radix dependencies stayed elsewhere, so the renderer crashed before React mounted.
- Fix: use exact package-boundary checks for `react`, `react-dom`, and `scheduler`, and split `zustand` into `vendor-zustand`.
- Verification: clean Chrome/CDP desktop and mobile smoke rendered `ShreyamNotes` with `#root` content and 0 runtime console errors. Screenshots:
  - `output/playwright/yellow-fix-desktop-20260628.png`
  - `output/playwright/yellow-fix-mobile-20260628.png`

## Final Benchmarks

Default vault:

| Suite | Startup ms median/p95 | PSS MiB median/p95 | Result |
| --- | ---: | ---: | --- |
| `perf-final-default-20260628T124212Z` | 454 / 500 | 127.8 / 128.0 | pass |

Large vault:

| Suite | Fixture | Startup ms median/p95 | PSS MiB median/p95 | Result |
| --- | --- | ---: | ---: | --- |
| `perf-final-vault5000-20260628T124254Z` | 5000 notes, 2 large markdown files, 2 large code files | 431 / 489 | 161.8 / 162.1 | pass |

## Verification

- `bun install --frozen-lockfile --dry-run` passed.
- `bun run typecheck` passed.
- `bun run test:run` passed.
- `go test ./...` at the port root passed, but only found a stray Go package in `node_modules`.
- `go test ./...` from `apps/server` passed the real Go suite.
- `make wails-build` passed.
- Chrome/CDP desktop and mobile smoke passed with 0 runtime console errors.

## Notes

- The final build still reports a Rolldown warning for `jsxgraph` using direct `eval` internally. It is a third-party diagram parser warning, not a startup failure.
- The final embedded dist is measured with `du -sb apps/server/cmd/shreyamnotes-wails/dist`.
