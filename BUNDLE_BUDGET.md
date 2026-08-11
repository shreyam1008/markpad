# Bundle Budget

Markpad aims for a production binary under **10 MB** and keeps webview memory growth bounded.
This file tracks what each layer costs so new features stay within budget.

## Binary composition (production build, embedded frontend)

| Component | Estimated size | Notes |
|-----------|---------------|-------|
| Go runtime + stdlib | ~4.5 MB | net/http, encoding, os, json, path |
| Wails v2 framework | ~2.5 MB | Webview bindings, IPC, menus, dialogs |
| Embedded frontend (`frontend/`) | ~120 KB | HTML + JS + precompiled CSS (see below) |
| Session/history logic (`internal/`) | ~15 KB | Pure Go, no heavy deps |
| **Total binary** | **~8 MB** | Confirmed via `wails build` |

## Frontend assets (embedded in binary)

| File | Raw size | Lines | Role |
|------|---------|-------|------|
| `frontend/src/main.js` | ~70 KB | ~1500 | All frontend logic |
| `frontend/index.html` | ~16 KB | ~230 | App shell |
| `frontend/src/tailwind.css` | ~21 KB | generated | Precompiled utility CSS |
| `frontend/src/styles.css` | ~8 KB | ~170 | Custom CSS overrides |
| **Total frontend** | **~115 KB** | | Embedded in binary |

## CDN dependencies (loaded at runtime, NOT in binary)

| Library | CDN size (gzip) | Load | Purpose |
|---------|----------------|------|---------|
| marked.js | ~36 KB | sync | Markdown parser |
| highlight.js core | ~45 KB | sync | Syntax highlighting (40 languages) |
| highlight.js extras (8 packs) | ~12 KB total | defer | lua, dart, toml, dockerfile, cmake, elixir, nim, zig |
| DOMPurify | ~12 KB | sync | XSS sanitization |
| pdf.js | ~200 KB | defer | PDF rendering (loaded only when needed) |
| pdf.js worker | ~290 KB | on-demand | PDF page rendering (loaded by pdf.js) |
| github-markdown-css | ~10 KB | async | Markdown preview styling |
| highlight.js github theme | ~3 KB | async | Code theme |
**Total CDN at first load:** ~105 KB gzipped (no PDF)
**Total CDN with PDF open:** ~730 KB gzipped

## Go backend code

| File | Lines | Bytes | Responsibility |
|------|-------|-------|----------------|
| `app.go` | ~646 | ~16 KB | All Wails-bound methods, file ops, session bridge |
| `main.go` | ~129 | ~4 KB | App entry, menus, single-instance, CLI args |
| `internal/session/session.go` | ~447 | ~10 KB | Session, documents, bookmarks, recent, drafts, atomic write |
| `internal/session/history.go` | ~238 | ~5 KB | Version snapshots, listing, pruning, timeAgo |
| **Total Go** | **~1460** | **~35 KB** | |

## Runtime memory profile

Linux WebKitGTK uses separate main, network, and web processes. Measure total PSS, not summed RSS,
because shared pages make RSS misleading.

| Build | Total idle PSS | Notes |
|-------|---------------:|-------|
| v0.7 with Tailwind browser compiler | ~349 MB | Measured June 7, 2026 |
| Current precompiled-CSS/lazy-PDF build | ~191 MB | Measured June 7, 2026 after 15s idle; about 45% lower |

The webview baseline dominates memory. Document data, undo, diffs, PDF canvases, and image reads are
explicitly bounded below so usage does not grow without control.

## Budget rules

- **Binary must stay under 10 MB.** Do not add heavy Go dependencies.
- **Frontend JS must stay under 80 KB raw** (excluding CDN). Currently ~70 KB.
- **Tailwind is precompiled.** Never restore the browser CDN compiler; regenerate with `make css`.
- **No new sync CDN scripts.** Any new library must load with `defer` or on-demand.
- **Syntax highlighting capped at 5000 lines.** Prevents webview OOM on huge files.
- **LCS diff is capped at 2 million comparison cells.** Common prefixes/suffixes are removed first; larger rewrites use a linear-memory fallback.
- **Undo history is capped at 80 states and 1 MB of text per edited document.**
- **PDF: first 2 pages rendered, next pages in batches of 3.** Prevents canvas memory bloat.
- **Images limited to 50 MB via ReadFileBase64.** Go-side guard.
- **History: max 50 snapshots per note.** Auto-pruned on save.

## Adding a new feature — checklist

1. Will it add a Go dependency? Check `go.sum` impact.
2. Will it add a CDN library? Must use `defer` and document size here.
3. Will it increase `main.js` significantly? Keep under 80 KB.
4. Will it hold data in memory? Document expected RSS impact.
5. Update this file with the new row in the appropriate table.
