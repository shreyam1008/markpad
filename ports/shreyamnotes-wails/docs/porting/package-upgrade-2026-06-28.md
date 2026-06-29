# Package Upgrade Log - 2026-06-28

Scope: ShreyamNotes Wails/WebKitGTK port in `ports/shreyamnotes-wails`.

## Rules

- The active desktop app is Wails/WebKitGTK. The port should not keep legacy desktop runtime as a runtime dependency.
- Upgrade direct JavaScript and Go dependencies to the latest compatible versions that can pass local verification.
- Prefer low-dependency tooling and avoid adding heavy runtime packages without measurement.
- Record build time, binary size, startup, and memory before and after each major change.

## Registry Check

- `vite`: latest `8.1.0`; no `8.2.*` version exists in the registry at this checkpoint.
- `typescript`: latest stable `6.0.3`; `7.0.1-rc` exists on the `rc` dist-tag.
- `eslint`: latest `10.6.0`.
- `prettier`: latest `3.9.1`.
- `exfmt`: not found in the package registry.
- `exlint`: latest `0.1.6`, but not selected until it proves useful over established lint tooling.

## Baseline Before Package Changes

Commit state: isolated port is untracked from root as `ports/`; no changes promoted to main.

Build:

| Metric | Value |
| --- | ---: |
| Command | `/usr/bin/time -f 'elapsed_seconds=%e max_rss_kib=%M' make wails-build` |
| Result | pass |
| Wall time | 25.61 s |
| Peak build RSS | 2,065,072 KiB |
| Final binary | `dist/shreyamnotes` |
| Binary size | 23,794,024 bytes |

Runtime default baseline:

| Metric | Value |
| --- | ---: |
| Suite | `pkg-upgrade-before-default-20260628T103907Z` |
| Runs | 3/3 OK |
| Startup median/p95 | 822/845 ms |
| PSS median/p95 | 145.1/145.2 MiB |
| USS median/p95 | 98.3/98.4 MiB |
| RSS median/p95 | 428.2/429.3 MiB |

Runtime large-vault baseline:

| Metric | Value |
| --- | ---: |
| Suite | `pkg-upgrade-before-vault5000-20260628T103937Z` |
| Fixture | `notes5000-folders50-md2x16MiB-code2x16MiB-seed20260628` |
| Runs | 3/3 OK |
| Startup median/p95 | 784/819 ms |
| PSS median/p95 | 182.7/185.2 MiB |
| USS median/p95 | 134.6/136.9 MiB |
| RSS median/p95 | 465.4/467.9 MiB |

## Iterations

### Iteration 0 - Baseline

- Captured package inventory with an outdated-package JSON report.
- Captured Go module update candidates with `go list -m -u -json all`.
- Confirmed current WebKitGTK Wails binary and runtime performance before package changes.

### Iteration 1 - Wails-Only Port Cleanup

- Removed the copied legacy desktop workspace at `apps/desktop` from the isolated port.
- Removed obsolete desktop packaging recipes from `packaging/`.
- Removed obsolete runtime smoke scripts that required the old desktop runtime.
- Rewired root package scripts and Makefile entries to Wails/WebKitGTK, web, and server commands.
- Rewrote remaining source/docs comments so old-runtime wording is gone from source and lockfile.

### Iteration 2 - Dependency Upgrade

- Upgraded direct JS dependencies with `ncu@22.2.8 --workspaces --target latest -u`.
- Upgraded key runtime/tooling packages:
  - React `18.3.1` -> `19.2.7`
  - Vite `5.4.x` -> `8.1.0`
  - `@vitejs/plugin-react` `4.3.x` -> `6.0.3`
  - Tailwind `3.4.x` -> `4.3.1`
  - TypeScript `5.7.x` -> `7.0.1-rc`
  - Vitest `2.1.x` -> `4.1.9`
  - Turbo `2.5.x` -> `2.10.0`
- Added lightweight tooling:
  - `oxlint` `1.71.0`
  - `@biomejs/biome` `2.5.1`
- Migrated Tailwind integration to `@tailwindcss/vite` and removed the old PostCSS config path.
- Ran `go get -u ./... && go mod tidy` in `apps/server`.
  - Direct Go modules upgraded: `github.com/coder/websocket` `v1.8.15`, `github.com/fsnotify/fsnotify` `v1.10.1`, `github.com/go-chi/chi/v5` `v5.3.0`.
  - Wails remains current at `github.com/wailsapp/wails/v2 v2.12.0`.
  - Go directive moved to `1.25.0`.

### Iteration 3 - Bun Workspace Migration

- Switched the package manager to `bun@1.3.14`.
- Added `bun.lock` as the only source lockfile and removed source lockfiles from the old package-manager path.
- Converted root scripts, Makefile targets, Dockerfile, and server helper scripts to Bun commands.
- Added `integrations/*` to the Bun workspace so the Raycast extension is covered by the root lockfile.
- Added direct `typescript@^7.0.1-rc` dev dependencies to packages that run `tsc` directly.
- Measured lock refresh after adding the Raycast workspace:

| Metric | Value |
| --- | ---: |
| Command | `/usr/bin/time -f 'elapsed_seconds=%e max_rss_kib=%M' bun install` |
| Result | pass |
| Wall time | 4.22 s |
| Peak install RSS | 362,128 KiB |

### Iteration 4 - Runtime Wording and CI Cleanup

- Removed user-facing old-runtime references from the active Wails port paths.
- Converted public setup docs, benchmark docs, CI, release workflow, Raycast docs, and Raycast status UI from old package-manager wording to Bun.
- Removed broken AUR/Nix packaging workflows because the `packaging/` tree is not present in this isolated port.
- Reworked `flake.nix` into a dev-shell-only Wails/Bun environment.
- Converted Raycast extension status fields from old package-manager-specific names to `bun*` names in the shared bridge contract.

### Iteration 5 - Production React Singleton Fix

- Playwright caught a production-only blank screen with `Cannot read properties of null (reading 'useCallback')`.
- Fixed Vite resolution by forcing React/ReactDOM aliases and `resolve.dedupe` for React singletons.
- Normalized manual chunk path checks and kept only safe app helper chunking.
- The production `vendor-react` chunk dropped from about 419 KiB to about 220 KiB, confirming duplicate React factories were removed.

### Iteration 6 - Final Verification and Metrics

Install and audit:

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile --dry-run` | pass |
| `bun audit --audit-level moderate` | pass |
| Old runtime/package-manager command scan | no active hits outside this log |

Tests:

| Command | Result |
| --- | --- |
| `bun run typecheck` | pass |
| `bun --filter @zennotes/app-core test:run` | 81 files passed, 1 skipped; 585 tests passed, 1 skipped |
| `bun run test:run` | pass across app-core, shared-domain, server, and echo-only packages |
| `go test ./...` in `apps/server` | pass |

Build:

| Metric | Value |
| --- | ---: |
| Command | `/usr/bin/time -f 'elapsed_seconds=%e max_rss_kib=%M' make wails-build` |
| Result | pass |
| Cache policy | warm local Go/build cache |
| Wall time | 7.07 s |
| Peak build RSS | 956,872 KiB |
| Binary size | 24,637,480 bytes |
| Embedded web dist size | 14,555,221 bytes |

Runtime default final:

| Metric | Value |
| --- | ---: |
| Suite | `pkg-upgrade-after-bun-final-default-rerun-20260628T112200Z` |
| Runs | 3/3 OK |
| Startup median/p95 | 701/708 ms |
| PSS median/p95 | 174.3/176.7 MiB |
| USS median/p95 | 128.5/130.8 MiB |
| RSS median/p95 | 456.1/458.3 MiB |

Runtime large-vault final:

| Metric | Value |
| --- | ---: |
| Suite | `pkg-upgrade-after-bun-final-vault5000-20260628T112116Z` |
| Fixture | `notes5000-folders50-md2x16MiB-code2x16MiB-seed20260628` |
| Fixture size | 5,005 files; 72,848,773 bytes |
| Runs | 3/3 OK |
| Startup median/p95 | 709/714 ms |
| PSS median/p95 | 208.9/212.1 MiB |
| USS median/p95 | 163.1/166.2 MiB |
| RSS median/p95 | 490.7/493.8 MiB |

Playwright evidence:

| Check | Result |
| --- | --- |
| Desktop screenshot | `.playwright-cli/page-2026-06-28T11-19-45-547Z.png` |
| Mobile screenshot | `.playwright-cli/page-2026-06-28T11-19-48-761Z.png` |
| Console | 0 errors, 0 warnings |
| DOM | title `ShreyamNotes`, root child count `1`, onboarding text visible |

Performance read:

- Startup improved versus the pre-upgrade Wails baseline in both default and large-vault runs.
- Final Wails memory is still far below the earlier packaged upstream desktop baseline, but PSS increased versus the pre-upgrade Wails baseline. The next performance pass should target app-core bootstrap memory and post-ready vault indexing rather than package-manager or Wails shell overhead.
