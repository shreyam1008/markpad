# Markpad Stabilization Status

Updated: 2026-06-24

## Current baseline

- `make validate` passes: core tests, all Go tests, production-tag tests, `go vet`, `node --check frontend/src/main.js`, and `make build`.
- Wails CLI build now works with the committed `wails.json`: `go run github.com/wailsapp/wails/v2/cmd/wails@v2.12.0 build -nopackage -nosyncgomod -m`.
- Release binary remains lightweight: `dist/markpad` is about 9.4 MiB.
- Wails CLI binary output is about 9.5 MiB at `dist/bin/markpad`.
- Runtime process tree sample from the recovery pass: about 426.1 MiB summed RSS and 173.5 MiB PSS after 3 seconds.
- UI evidence captured from a real app window at 1180x760 showed the editor, sidebar, top toolbar, and status bar.

## Recent stabilization commits

- `d4eba33` exposes Linux process-tree RSS/PSS diagnostics in Runtime Stats and Local Footprint.
- `9d5e269` adds a runtime memory stats regression test.
- `5e035e3` aligns validation guardrails, CI checks, generated-file ignores, and architecture docs.
- `01b1cc2` adds task source traces and lightweight file badge polish.
- `3de40c3` preserves the original long-horizon upgrade brief.

## Active agent lanes

- Luffy: frontend readability/refinement lane, focused on long-line editor wrapping and file identity.
- Sanji: guardrail/refinement lane, focused on a lightweight budget command.
- Chopper: validation/perf QA lane, focused on build/test/runtime baseline verification.

## Confirmed gaps

- UI: long editor lines can force horizontal scrolling; soft wrap and file identity need refinement.
- UI: sidebar and top title truncation can make the active file hard to identify.
- Diagnostics: process-tree memory is now exposed, but the UI still needs follow-up perf checks after each feature slice.
- Tasks: rendering should be paged or virtualized before task features expand further.
- Trash: draft trash needs a byte cap, not just an item-count cap.
- Canvas: bounds caching and render scheduling should come before heavier infinite-canvas features.
- Search: broader local-folder search should stay streamed, cancellable, and measurable before considering an FTS sidecar.

## Working rules for the next phase

- Keep `Makefile` as the canonical release build path.
- Keep `wails.json` as thin Wails CLI compatibility config.
- Do not add heavy icon packs, drawing runtimes, or sync services in phase 1.
- Keep work local-first and file-backed.
- Commit completed slices with short, specific messages.
- Keep feature workers on disjoint write scopes; `frontend/src/main.js` is a monolith and should not have multiple concurrent editors.
