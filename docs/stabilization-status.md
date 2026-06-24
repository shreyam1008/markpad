# Markpad Stabilization Status

Updated: 2026-06-24

## Current baseline

- `make validate` passes: core tests, all Go tests, desktop production-tag tests, `go vet`, `node --check frontend/src/main.js`, `make build`, and `make budget`.
- `make smoke-desktop` passes on the current tree after the search-help slice.
- Wails CLI build now works with the committed `wails.json`: `go run github.com/wailsapp/wails/v2/cmd/wails@v2.12.0 build -nopackage -nosyncgomod -m`.
- Release binary remains lightweight: `dist/markpad` is about 9.42 MiB.
- Frontend source remains below the warning threshold: `frontend/src/main.js` is about 768.6 KiB, warning at 800 KiB, hard cap at 900 KiB.
- Wails CLI binary output is about 9.5 MiB at `dist/bin/markpad`.
- Runtime process tree sample from the latest direct memory gate: about 415.5 MiB summed RSS and 172.9 MiB PSS across the main Wails/WebKit process tree.
- UI evidence from the desktop-tag recovery found that builds without `desktop` can open a blank Wails shell; build tags are now guarded.
- Desktop smoke now uses an env-gated DOM probe because Linux XWD screenshots can show WebKit surfaces as blank white even when Markpad's DOM is live and sized.
- One parallel perf/UI run saw an early native exit before the DOM probe, while immediate validation and direct memory reruns passed. Treat native startup as a watch item, not a current blocker.

## Recent stabilization commits

- `972a537` adds lightweight frontend asset guardrails.
- `a392f13` adds local-folder search exclusions.
- `76c953e` makes file trash cleanup auditable and non-destructive during listing.
- `537f992` exposes task scan diagnostics.
- `cf7194d` caps aggregate canvas undo memory.
- `d4eba33` exposes Linux process-tree RSS/PSS diagnostics in Runtime Stats and Local Footprint.
- `9d5e269` adds a runtime memory stats regression test.
- `5e035e3` aligns validation guardrails, CI checks, generated-file ignores, and architecture docs.

## Active agent lanes

- Main orchestrator: integrates slices, owns commits, and prevents overlapping edits in high-conflict files.
- Nami: validation lane for build, tests, budget, and desktop smoke.
- Chopper: perf/UI lane for memory, binary/frontend size, startup, and visual evidence.
- Robin: research lane for local-first search, task formats, canvas formats, and lightweight icon choices.

## Confirmed gaps

- Runtime: keep watching native startup because one parallel perf run exited before the DOM probe even though validation and memory reruns passed.
- UI: keep direct visual checks in the loop; static browser screenshots do not prove Wails/WebKit runtime behavior.
- Search: field exclusions are implemented and discoverable; local-folder scans are serialized so fast repeated searches do not publish stale older results.
- Tasks: rendering should be paged or virtualized before task features expand further.
- Trash: draft trash has a localStorage byte cap and guardrail coverage; keep manual UI checks around restore/copy before expanding Trash reports.
- Canvas: import caps now guard JSON size, element count, path points, and embedded files before imported data mutates the canvas.
- Canvas: bounds caching, render scheduling, and export/import round-trip tests should come before richer adapters.

## Working rules for the next phase

- Keep `Makefile` as the canonical release build path.
- Keep `wails.json` as thin Wails CLI compatibility config.
- Do not add heavy icon packs, drawing runtimes, or sync services in phase 1.
- Keep work local-first and file-backed.
- Commit completed slices with short, specific messages.
- Keep feature workers on disjoint write scopes; `frontend/src/main.js` is a monolith and should not have multiple concurrent editors.
- Keep files as source of truth; indexes, views, sessions, and exports must remain rebuildable or disposable.
