# Bundle Budget

Markpad aims for a production binary under **10 MB** and keeps webview memory growth bounded.
This file tracks what each layer costs so new features stay within budget.

## Binary composition (production build, embedded frontend)

| Component | Estimated size | Notes |
|-----------|---------------|-------|
| Go runtime + stdlib | ~4.5 MB | net/http, encoding, os, json, path |
| Wails v2 framework | ~2.5 MB | Webview bindings, IPC, menus, dialogs |
| Embedded frontend (`frontend/`) | ~0.9 MB raw source | HTML + JS + precompiled CSS (see below) |
| Session/history logic (`internal/`) | ~15 KB | Pure Go, no heavy deps |
| **Total binary** | **9,839,400 bytes / 9.38 MiB** | `dist/markpad`, measured June 24, 2026 via `make budget` |

## Frontend assets (embedded in binary)

| File | Raw size | Lines | Role |
|------|---------|-------|------|
| `frontend/src/main.js` | 766,385 bytes / 748.4 KiB | ~15000 | All frontend logic |
| `frontend/index.html` | ~16 KB | ~230 | App shell |
| `frontend/src/tailwind.css` | ~21 KB | generated | Precompiled utility CSS |
| `frontend/src/styles.css` | measured in repo | custom | Custom CSS overrides |
| **Total frontend** | **~0.9 MB** | | Embedded in binary |

## Runtime frontend libraries (embedded/local, no CDN fetch)

Production builds embed the frontend assets in the Wails binary. First paint should not depend on
Tailwind CDN, Google Fonts, highlight.js CDN, pdf.js CDN, or any other remote script/style.

| Asset/library | Runtime load | Purpose |
|---------------|--------------|---------|
| marked.js | local script | Markdown parser |
| Code View | local escaped HTML, bounded to 5000 lines | Code preview without a highlighter dependency |
| DOMPurify | local script | XSS sanitization |
| Markdown/code CSS | local CSS | Markdown preview and code styling |
| PDF handling | no runtime renderer/CDN script | Local read-only card with Open Externally |

**Runtime CDN at first load:** 0 KB.
**Runtime CDN with PDF open:** 0 KB.

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
| Current precompiled-CSS/local-PDF-card build | ~191 MB | Measured June 7, 2026 after 15s idle; about 45% lower |
| June 24, 2026 recovery build | ~173.5 MB PSS / ~426.1 MB RSS | 3s sample: main process + WebKit network + WebKit web process |

The webview baseline dominates memory. Document data, undo, diffs, PDF canvases, and image reads are
explicitly bounded below so usage does not grow without control.

`Runtime Stats` and `Local Footprint` report self RSS plus Linux process-tree RSS/PSS. RSS matches what
many process monitors show, while PSS is the better budget metric because WebKit shares memory pages
between the main, network, and web processes.

## Budget rules

- **Binary must stay under 10 MB.** Do not add heavy Go dependencies.
- **Frontend JS growth must be intentional and measured.** The current monolith is already ~743 KB raw;
  prefer pruning, splitting, or lazy paths before adding large new features.
- **Automated guard:** run `make budget` from the repo root. It checks `dist/markpad` against a
  10 MiB hard limit and `frontend/src/main.js` against an 800 KiB warning threshold and 900 KiB
  hard limit. Override the binary path with `MARKPAD_BUDGET_BINARY=/path/to/markpad make budget`.
- **Tailwind is precompiled.** Never restore the browser CDN compiler; regenerate with `make css`.
- **No runtime CDN scripts or styles.** New libraries should be vendored locally and load with `defer` or on-demand when they are not required for first paint.
- **Code View capped at 5000 lines.** Prevents webview OOM on huge files.
- **LCS diff is capped at 2 million comparison cells.** Common prefixes/suffixes are removed first; larger rewrites use a linear-memory fallback.
- **Undo history is capped at 80 states and 1 MB of text per edited document.**
- **PDF: keep read-only cards with Open Externally unless a local renderer is reintroduced with an explicit memory budget.**
- **Images limited to 50 MB via ReadFileBase64.** Go-side guard.
- **History: max 50 snapshots per note.** Auto-pruned on save.

## Adding a new feature — checklist

1. Will it add a Go dependency? Check `go.sum` impact.
2. Will it add a third-party frontend library? Prefer avoiding it; if needed, vendor locally, avoid first-paint blocking, and document size/load behavior here.
3. Will it increase `main.js` significantly? Keep under 80 KB.
4. Will it hold data in memory? Document expected RSS impact.
5. Update this file with the new row in the appropriate table.
