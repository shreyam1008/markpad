# Markpad upgrade validation guardrails

This file keeps the long-running local-first upgrade aligned with the original goal: refined UI, stronger local search, themes, lightweight assets, split/edit polish, trash retention, task views, and canvas improvements without sacrificing RAM or binary size.

## Required checkpoint commands

Run these before calling a validation checkpoint green:

```sh
make test
/usr/local/go/bin/go test ./...
/usr/local/go/bin/go test -tags production,webkit2_41 ./...
/usr/local/go/bin/go vet ./...
node --check frontend/src/main.js
make build
stat -c '%s' dist/markpad
du -h dist/markpad
```

Current validated baseline:

- Date: 2026-06-24
- Binary: `dist/markpad`
- Binary size: `9,777,960` bytes (`9.4M`)
- Idle native smoke RSS observed by perf agent: about `188 MB` on this Linux/WebKit machine.

## Perf guardrails

- Do not add image packs, icon fonts, large web fonts, WASM, source maps, or heavy canvas/search runtimes without a measured justification.
- Keep theme polish CSS-variable based.
- Keep command/menu icons text/CSS based and measurable through Lightweight Assets.
- Keep search result rendering capped.
- Keep local-folder search bounded, cancellable or serialized in backend follow-up work, and explicit about skipped/capped counts.
- Keep canvas JSON portable; do not persist cached bounds, raster previews, or spatial indexes until profiling proves they are needed.
- Keep canvas DPR capped and full PNG export bounded.
- Keep task views as projections over Markdown, not a second task database.
- Keep Trash reports metadata-first; avoid exporting deleted draft bodies by default.

## Validation agents

Use parallel agents during large work:

- Luffy: tests, build checks, code-quality guardrails.
- Nami: RAM, binary size, UI/perf smoke, visual risk review.
- Robin: primary-source research for Wails, Go profiling, WebView, canvas, SQLite FTS5, and local-first formats.

Main orchestrator owns integration, fixes, commits, and scope control.

## Next measurements

- Cold start RSS with a clean profile and with a real heavy profile.
- Search typing latency with 100, 500, and 1000 loaded notes.
- Task modal memory and DOM cost with 1000 visible tasks in list, calendar, and kanban.
- Canvas frame time with minimap on/off at 100, 1000, and 5000 elements.
- Canvas undo heap growth near the snapshot cap.
- Full PNG export peak RSS near the 4096 px cap.
- Windows installer VM smoke for file associations before shipping NSIS changes.
