# Markpad Agent Guide

> **This file is the single source of truth for AI agents working on Markpad.**
> Read this ENTIRE file before making ANY changes. Violations break the product.

---

## What is Markpad?

Markpad is a **tiny native Markdown notepad/viewer** built with Go + Wails v2 (OS webview, NOT Electron). It must feel as immediate as Mousepad or Notepad while providing split-view editing, version history, PDF/image preview, session restore, and a modern quiet interface.

**Core identity:** Lightweight, fast, native, private. Every design decision serves this.

---

## Hard constraints — NEVER violate these

| Rule | Why |
|------|-----|
| **No Electron, Tauri, or CEF** | Native webview only. Binary must stay under 10 MB. |
| **No React, Vue, Svelte, or any JS framework** | Frontend is vanilla JS. Bundle must stay under 80 KB raw. |
| **No Redux, Zustand, or state management libraries** | State is managed by Go backend + simple JS variables. |
| **No new synchronous CDN scripts** | New libraries MUST use `defer` or on-demand loading. |
| **No heavy Go dependencies** | Only `wails/v2` as direct dependency. Prefer stdlib. |
| **No cloud, no telemetry, no external API calls** | All data is local. Privacy is non-negotiable. |
| **No inline `onclick` or `onXxx` handlers in HTML** | Use `addEventListener` or event delegation. |
| **No emojis in code** unless the user explicitly asks | Emojis in UI strings (file icons) are fine. |
| **No new files without purpose** | Don't create random docs, configs, or helpers. |
| **Never weaken or delete existing tests** | Only add or improve. |
| **Never edit existing migration files** | Create new ones if schema changes. |

---

## Tech stack (do NOT change without explicit approval)

| Layer | Technology | Size impact |
|-------|-----------|-------------|
| Backend | Go 1.24 + Wails v2 | ~7 MB binary |
| Frontend | Vanilla HTML/CSS/JS | ~85 KB embedded |
| Styling | Tailwind CSS (CDN) | ~110 KB gzip runtime |
| Markdown | marked.js + highlight.js + DOMPurify | ~93 KB gzip runtime |
| PDF | pdf.js (CDN, deferred) | ~490 KB gzip on-demand |
| Icons | Inline SVG in toolbar buttons | 0 KB extra |
| Session | Go JSON persistence in app config dir | 0 KB extra |

See `BUNDLE_BUDGET.md` for detailed size tracking.

---

## Architecture

```
markpad/
  main.go                  # Wails app entry, window config, native menus, single-instance lock
  app.go                   # Go backend: all Wails-bound methods (session, file ops, history)
  internal/
    session/
      session.go           # Document, Bookmark, RecentFile, Session, Store, draft I/O, atomic writes
      history.go           # Snapshot storage, listing, restore, pruning (max 50 per note)
  frontend/
    index.html             # App shell: Tailwind config, CDN scripts, HTML structure
    src/
      main.js              # ALL frontend logic (~1300 lines): editor, preview, split, toolbar, sidebar, history, find, shortcuts, modals, PDF, image, scroll position
      styles.css            # Minimal custom CSS (~116 lines): toolbar, views, context menu, diff, markdown overrides
  BUNDLE_BUDGET.md         # Size/memory budget per feature (update when adding features)
  agents.md                # THIS FILE — agent contract
  TODO.md                  # Forward-looking roadmap
  docs/                    # GitHub Pages website (Tailwind CSS, SEO)
  packaging/               # Linux .desktop, metainfo, SVG icon; macOS Info.plist
  snap/                    # Snap packaging (snapcraft.yaml)
  tests/                   # Integration tests (Go)
  .github/workflows/       # CI: cross-platform builds (Linux, Windows, macOS)
```

---

## Go backend methods (exposed to frontend via Wails)

Frontend calls these as `window.go.main.App.MethodName()`.

| Method | Returns | Purpose |
|--------|---------|---------|
| `GetSession()` | `SessionState` | All notes, favorites, recents, active ID |
| `GetActiveContent()` | `string` | Draft content of active note |
| `GetNoteContent(id)` | `string` | Draft content of specific note |
| `SetActive(id)` | — | Switch active note |
| `NewNote()` | `SessionState` | Create empty untitled note |
| `UpdateContent(id, content)` | — | Save draft, update title (guards read-only) |
| `SaveActive(content)` | `SessionState, error` | Save to disk (or triggers Save As if no path) |
| `SaveAsDialog(content)` | `SessionState, error` | Native save dialog |
| `OpenFileDialog()` | `SessionState, error` | Native open dialog |
| `ToggleStar(id)` | `SessionState` | Toggle bookmark/favorite |
| `DeleteNote(id)` | `SessionState` | Remove unsaved draft (saved files cannot be deleted) |
| `CloseNote(id)` | `SessionState` | Close a non-dirty note |
| `ReorderNotes(ids)` | `SessionState` | Reorder notes by ID array (drag-drop) |
| `OpenPathFromBookmark(path)` | `SessionState, error` | Open a favorited/recent file |
| `GetHistory(id)` | `[]HistoryEntry` | List version snapshots (newest first) |
| `GetHistoryContent(id, ts)` | `string` | Full content of a specific snapshot |
| `RestoreVersion(id, ts)` | `SessionState, error` | Restore a note to a previous version |
| `GetFileInfo(id)` | `FileInfoResult` | File metadata for info modal |
| `OpenContainingFolder(path)` | — | Open parent folder in OS file manager (xdg-open/open/explorer) |
| `OpenExternalPath(path)` | — | Open file in OS default app |
| `OpenURL(url)` | — | Open URL in system browser |
| `ReadFileBase64(path)` | `string, error` | Read file as base64 (max 50 MB, for PDF/image) |
| `GetStoragePath()` | `string` | App config directory path |
| `RemoveRecent(path)` | `SessionState` | Remove from recent list |
| `OpenDroppedFile(path)` | `SessionState, error` | Open a drag-dropped file |

---

## File type handling

| Type | Extensions | View modes | Editor | Toolbar | Editable |
|------|-----------|------------|--------|---------|----------|
| Markdown | md, markdown, mdx | Editor, Split, Preview | Yes | Yes | Yes |
| Code | py, js, ts, go, rs, etc. | Editor, Code View | Yes | No | Yes |
| Text | txt, log, csv, tsv | Editor, Code View | Yes | No | Yes |
| PDF | pdf | Document (pdf.js pages) | No | No | No |
| Image | png, jpg, gif, webp, etc. | Inline preview | No | No | No |
| Ebook | epub, mobi, azw, etc. | Info card + Open Externally | No | No | No |
| Office | doc, docx, odt, rtf | Info card + Open Externally | No | No | No |
| Archive | zip, tar, gz, 7z, rar | Info card + Open Externally | No | No | No |

---

## Frontend conventions

### State management
- **No framework state.** All state lives in module-level `let`/`const` variables at the top of `main.js`.
- Key state: `activeId`, `cachedNotes`, `currentContent`, `committedContent`, `viewMode`, `noteViewModes`, `noteScrollPos`.
- Session truth comes from Go backend. Frontend calls `GetSession()` and re-renders.

### DOM access
- `$(id)` is a shorthand for `document.getElementById(id)`.
- All DOM refs are cached at the top of `main.js`. Do NOT query the DOM in loops.
- Use `el(tag, cls)` to create elements. Do NOT use `innerHTML` for interactive content — use DOM APIs.

### Event handling
- **No inline event handlers.** Use `addEventListener` or event delegation via `data-*` attributes.
- Global click listener hides context menu. Keyboard shortcuts in a single `keydown` listener.
- Toolbar actions use event delegation on the toolbar container.

### Rendering pipeline
- `renderViewer(content, active)` is the single dispatch point for all viewer rendering.
- It routes to: `renderPdf`, `renderImagePreview`, `renderMd`, `renderCode`, `renderDocumentCard`.
- **Never call these directly** from loadContent/setView/etc. — always go through `renderViewer`.
- Markdown rendering is debounced at 120ms. Code highlighting caps at 5000 lines.

### Scroll position
- `saveScrollPos()` saves editor + viewer scroll + cursor for the active note.
- `restoreScrollPos()` restores on note switch. Called at end of `loadContent`.
- **Every code path that switches notes** must call `saveScrollPos()` before switching.

### CSS rules
- Tailwind handles layout and spacing. Custom CSS in `styles.css` is ONLY for:
  - Toolbar buttons (`.tb`)
  - View buttons (`.view-btn`)
  - Context menu (`.ctx-item`)
  - Drag states, scrollbar, save animation
  - History panel, diff view
  - Markdown body overrides
  - Document cards (`.doc-card`)
- **No inline styles** except in generated HTML (modals, document cards).
- **No new CSS files.** Everything goes in `styles.css`.

---

## Go backend conventions

### Code organization
- `main.go`: App entry, menus, CLI args, single-instance lock. Nothing else.
- `app.go`: All Wails-bound methods + helper functions. Types at the top.
- `internal/session/`: Pure Go, no Wails dependency, fully testable.
  - `session.go`: Document, Bookmark, RecentFile, Session, Store, drafts.
  - `history.go`: Snapshots, listing, pruning, timeAgo.

### Adding a new backend method
1. Add the method to `App` in `app.go`.
2. Add the method signature to the table in this file.
3. If it changes session state, call `a.store.Save(a.sess)` and return `SessionState`.
4. If it's a new concept (not just a method), add a struct/type near existing types.
5. Guard read-only paths with `isReadOnlyPath()`.

### Error handling
- Return `(SessionState, error)` for fallible operations. Frontend handles the error.
- Use `fmt.Errorf` with descriptive messages. Never panic.
- Log to stderr with `fmt.Fprintf(os.Stderr, ...)` for startup errors only.

### File I/O
- All disk writes use `atomicWrite` (write to temp, rename).
- All paths are normalized to absolute via `filepath.Abs`.
- Read-only check via `isReadOnlyPath` → `fileKind` → extension lookup.
- Binary detection via `looksBinary` (null byte scan of first 8 KB).
- `ReadFileBase64` has a 50 MB cap.

### Cross-platform
- `OpenContainingFolder` and `OpenExternalPath` use `openDir` helper:
  - Linux: `xdg-open`
  - macOS: `open`
  - Windows: `explorer`
- `OpenURL` uses Wails `runtime.BrowserOpenURL` (works cross-platform for HTTP URLs).
- Build tags: `production,webkit2_41` for Linux production builds.

### Testing
- Tests live in `tests/` (integration) and can be added as `_test.go` files in `internal/session/`.
- Test session logic by creating a temp `Store` via `NewStoreAt`.
- **Run `go test ./...` before committing.** All tests must pass.
- **Run `gofmt -w .` before committing.**

---

## Persistence rules

- Unsaved drafts: `{config_dir}/markpad/drafts/{id}.md`
- Session: `{config_dir}/markpad/session.json`
- History: `{config_dir}/markpad/history/{doc-id}/{timestamp}.json`
- Max 50 snapshots per note; oldest auto-pruned.
- Snapshots on: save, save-as, open, restore.
- **Never discard unsaved content** without explicit user action.
- Bookmark/favorite paths are absolute and deduplicated.

---

## Performance budget

| Metric | Target | Enforced by |
|--------|--------|-------------|
| Production binary | < 10 MB | `BUNDLE_BUDGET.md` |
| Frontend JS raw | < 80 KB | `BUNDLE_BUDGET.md` |
| Cold start to interactive | < 500 ms | No heavy sync scripts |
| Idle RSS | < 60 MB | No framework overhead |
| Markdown render debounce | 120 ms | `RENDER_MS` constant |
| Draft save debounce | 300 ms | `DRAFT_MS` constant |
| Syntax highlight cap | 5000 lines | `CODE_LINE_CAP` constant |
| Diff cap | 5000 lines | `simpleDiff` fallback |
| PDF initial pages | 5 | `MAX_INITIAL` in `renderPdf` |
| ReadFileBase64 cap | 50 MB | Go-side check |
| History snapshots/note | 50 | `maxSnapshots` constant |

---

## What agents MUST do

1. **Read this file first** before making changes.
2. **Read `BUNDLE_BUDGET.md`** before adding any dependency or feature.
3. **Preserve the rendering pipeline** — all viewer rendering goes through `renderViewer`.
4. **Preserve scroll position** — call `saveScrollPos()` before any note switch.
5. **Guard read-only types** — PDF, image, ebook, office, archive are never editable.
6. **Test before committing** — `go test ./...` and `gofmt -w .`
7. **Update this file** when adding backend methods or changing architecture.
8. **Update `BUNDLE_BUDGET.md`** when adding dependencies or features.
9. **Update `TODO.md`** when completing or adding roadmap items.
10. **Update the changelog** in `showChangelog()` when shipping a version.

## What agents MUST NOT do

1. **Do NOT install any JS framework** (React, Vue, Svelte, etc.).
2. **Do NOT install any CSS framework** beyond Tailwind CDN.
3. **Do NOT install any Go dependency** beyond wails/v2 without approval.
4. **Do NOT add sync-loading CDN scripts** — use `defer` or on-demand.
5. **Do NOT add inline `onclick` handlers** — use addEventListener.
6. **Do NOT create new CSS files** — use `styles.css`.
7. **Do NOT create new JS files** — all frontend logic lives in `main.js`.
8. **Do NOT split `main.js` into modules** (Wails embeds as flat files, no bundler).
9. **Do NOT add emojis** to code unless the user explicitly asks.
10. **Do NOT weaken or delete tests.**
11. **Do NOT hardcode file paths** or user-specific values.
12. **Do NOT add features without updating docs** (agents.md, BUNDLE_BUDGET.md).
13. **Do NOT use `innerHTML` for interactive elements** — use DOM APIs + event delegation.
14. **Do NOT leave dead code, commented-out blocks, or TODO comments** in production code.
15. **Do NOT create random documentation files** — use the existing structure.

---

## Code style

### Go
- `gofmt` enforced. No exceptions.
- Imports grouped: stdlib → internal → external. Sorted alphabetically within groups.
- Error handling: `if err != nil { return ..., err }`. Never ignore errors silently except in cleanup.
- Function names: exported methods are verbs (`GetSession`, `SaveActive`, `OpenFileDialog`).
- Helper functions: unexported, descriptive (`fileKind`, `isReadOnlyPath`, `looksBinary`, `openDir`).
- Structs: types defined near their usage. JSON tags on all exported fields.
- No goroutines unless absolutely necessary and documented.

### JavaScript
- Vanilla ES2020+. No TypeScript, no JSX, no build step.
- Variables: `const` by default, `let` when mutation needed. Never `var`.
- Functions: named functions for top-level, arrow functions for callbacks.
- DOM: cache refs at top of file. Use `el(tag, cls)` for creation.
- Async: `async/await` for all Go backend calls. Try/catch in user-facing paths.
- Strings: template literals for multi-line HTML. Single quotes elsewhere.
- No semicolons at end of lines (existing style; maintain consistency).
- Comments: section headers with `// ── Section name ──────` pattern.

### CSS
- Tailwind utilities in HTML `class` attributes.
- Custom CSS only when Tailwind cannot express it (animations, pseudo-elements, complex selectors).
- Colors reference the Tailwind config theme (surface, sidebar, accent, muted, etc.).
- No `!important` except in markdown body overrides (needed to override github-markdown-css).

---

## UX principles

- **Familiar:** File/View/Settings/Help menus. Standard shortcuts. No surprises.
- **Quiet:** Minimal UI. No tooltips-on-tooltips. No modal overload.
- **Fast:** Cold start feels instant. Typing never lags. Switching notes is seamless.
- **Respectful:** No data leaves the machine. No telemetry. No nag screens.
- **Forgiving:** Unsaved work survives crashes. Undo via version history.

---

## Release process

1. Update `Version` in `main.go`.
2. Update `snap/snapcraft.yaml` version.
3. Update `docs/index.html` schema version.
4. Update About modal in `main.js`.
5. Update `showChangelog()` in `main.js`.
6. Update `README.md` version history.
7. Update `TODO.md` completed items.
8. Update `BUNDLE_BUDGET.md` if sizes changed.
9. Run `go test ./...` and `gofmt -w .`
10. `git add -A && git commit && git push && git tag vX.Y.Z && git push --tags`
11. CI builds cross-platform binaries automatically.

---

## Version history

| Version | Codename | Key features |
|---------|----------|-------------|
| 0.1 | — | Editor, session restore, favorites, autosaved drafts |
| 0.2 | — | Version history with diffs, find bar, zoom |
| 0.3 | Aaradhya | Split view, formatting toolbar, drag-drop reorder, context menu |
| 0.4 | Balram | Drag-drop file open, smart view modes, expanded file icons |
| 0.5 | Chitrakala | Syntax highlighting, 3-section sidebar, read-only document cards |
| 0.6 | Dhruva | Single instance, PDF rendering, image preview, file info modal |
| 0.7 | Eklavya | Scroll position memory, extended syntax highlighting, performance, Open Folder fix |
