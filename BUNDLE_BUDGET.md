# Bundle Budget

Markpad aims for a production binary under **10 MB** and idle RSS under **60 MB**.
This file tracks what each layer costs so new features stay within budget.

## Binary composition (production build, embedded frontend)

| Component | Estimated size | Notes |
|-----------|---------------|-------|
| Go runtime + stdlib | ~4.5 MB | net/http, encoding, os, json, path |
| Wails v2 framework | ~2.5 MB | Webview bindings, IPC, menus, dialogs |
| Embedded frontend (`frontend/`) | ~85 KB | HTML + JS + CSS (see below) |
| Session/history logic (`internal/`) | ~15 KB | Pure Go, no heavy deps |
| **Total binary** | **~8 MB** | Confirmed via `wails build` |

## Frontend assets (embedded in binary)

| File | Raw size | Lines | Role |
|------|---------|-------|------|
| `frontend/src/main.js` | ~62 KB | ~1300 | All frontend logic |
| `frontend/index.html` | ~17 KB | ~232 | App shell + Tailwind config |
| `frontend/src/styles.css` | ~5.5 KB | ~116 | Custom CSS overrides |
| **Total frontend** | **~85 KB** | **~1650** | Embedded in binary |

## CDN dependencies (loaded at runtime, NOT in binary)

| Library | CDN size (gzip) | Load | Purpose |
|---------|----------------|------|---------|
| Tailwind CSS | ~110 KB | sync | Utility CSS framework |
| marked.js | ~36 KB | sync | Markdown parser |
| highlight.js core | ~45 KB | sync | Syntax highlighting (40 languages) |
| highlight.js extras (8 packs) | ~12 KB total | defer | lua, dart, toml, dockerfile, cmake, elixir, nim, zig |
| DOMPurify | ~12 KB | sync | XSS sanitization |
| pdf.js | ~200 KB | defer | PDF rendering (loaded only when needed) |
| pdf.js worker | ~290 KB | on-demand | PDF page rendering (loaded by pdf.js) |
| github-markdown-css | ~10 KB | async | Markdown preview styling |
| highlight.js github theme | ~3 KB | async | Code theme |
| Inter font | ~25 KB | swap | UI typeface |

**Total CDN at first load:** ~240 KB gzipped (no PDF)
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

| State | Expected RSS | Notes |
|-------|-------------|-------|
| Cold start (empty note) | ~30 MB | Go runtime + webview + DOM |
| 5 markdown files open | ~35 MB | Drafts in memory, DOM renders |
| 10 MB markdown file open | ~55 MB | Large textarea + preview HTML |
| PDF open (10 pages rendered) | ~50 MB | Canvas bitmaps in webview |
| 20 files + history panel | ~45 MB | Session JSON + snapshot metadata |

## Budget rules

- **Binary must stay under 10 MB.** Do not add heavy Go dependencies.
- **Frontend JS must stay under 80 KB raw** (excluding CDN). Currently ~62 KB.
- **No new sync CDN scripts.** Any new library must load with `defer` or on-demand.
- **Syntax highlighting capped at 5000 lines.** Prevents webview OOM on huge files.
- **LCS diff capped at 5000 lines.** Falls back to full old/new for larger files.
- **PDF: first 5 pages rendered, rest on-demand.** Prevents canvas memory bloat.
- **Images limited to 50 MB via ReadFileBase64.** Go-side guard.
- **History: max 50 snapshots per note.** Auto-pruned on save.

## Adding a new feature — checklist

1. Will it add a Go dependency? Check `go.sum` impact.
2. Will it add a CDN library? Must use `defer` and document size here.
3. Will it increase `main.js` significantly? Keep under 80 KB.
4. Will it hold data in memory? Document expected RSS impact.
5. Update this file with the new row in the appropriate table.
