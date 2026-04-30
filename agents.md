# Markpad Agent Guide

This file is the working contract for AI agents contributing to Markpad.

## Product intent

Markpad is a small native Markdown notepad/viewer built with **Wails v2** (Go backend + web frontend using the OS native webview). It should feel as immediate as a traditional Notepad or Mousepad-style desktop app, while adding a polished split-view editor+preview, version history, session restore, a formatting toolbar with SVG icons, drag-and-drop note reorder, and a modern but quiet interface.

The core promise is:

- Native desktop app powered by Go + system webview (NOT Electron).
- Small binary (~8 MB production with embedded frontend assets).
- Low idle memory and stable behavior with large text files.
- Open any text-like file: `.md`, `.txt`, `.json`, `.yaml`, `.py`, `.go`, `.js`, `.sh`, `.html`, `.css`, code, config, logs, and more.
- Split view: Editor, Split (side-by-side), and Preview modes with resizable divider.
- Version history: every save creates a snapshot, browse/preview/restore old versions in a right-side timeline panel.
- Unsaved work survives app close through local drafts.
- Native OS file dialogs for Open, Save, Save As.
- Full keyboard shortcuts (Ctrl+S, Ctrl+N, Ctrl+O, Ctrl+Shift+E, Ctrl+H, Ctrl+F, Ctrl+Del, etc.).
- Beautiful GitHub-style Markdown rendering via `marked.js` + `highlight.js`.
- Formatting toolbar with SVG icon buttons (bold, italic, headings, code, table, list, link, image, blockquote).
- Find in editor (Ctrl+F) with wrap-around search.
- File type icons in sidebar, per-note view mode memory, reading time in status bar.
- Star/favorite notes in sidebar. Drag-and-drop to reorder notes.
- Right-click context menu to star/delete notes. Only unsaved drafts can be deleted.
- Save animation with visual pulse. Bold "NOT SAVED" indicator.

## Tech stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Go + Wails v2 | Lightweight native app, OS webview, native dialogs |
| Frontend | Vanilla HTML/CSS/JS (no framework) | Minimal bundle, fast load, easy to maintain |
| Styling | Tailwind CSS (CDN) | Utility-first, clean, responsive |
| Markdown | marked.js + highlight.js + DOMPurify | GitHub-style rendering, syntax highlighting, XSS safe |
| Icons | Inline SVG in toolbar buttons | No external icon library needed |
| Session | Go JSON persistence in app config dir | Reliable, simple |

## Architecture

```
markpad/
  main.go                  # Wails app entry, window config, native menus
  app.go                   # Go backend: session, file ops, history, ReorderNotes, DeleteNote
  internal/
    session/               # Session persistence, drafts, bookmarks, version history (pure Go, testable)
      session.go           # Core session, document, bookmark, store, draft I/O
      history.go           # Snapshot storage, listing, restore, pruning (max 50 per note)
  frontend/
    index.html             # Single-page app shell (Tailwind + CDN libs)
    src/
      main.js              # All frontend logic: editor, preview, split view, toolbar, sidebar, history panel, find bar, drag-drop, shortcuts, modals
      styles.css           # Minimal custom CSS (toolbar, view buttons, context menu, drag states, history panel, scrollbar, markdown overrides)
  docs/                    # GitHub Pages website (Tailwind CSS, SEO, animations)
  packaging/               # Linux .desktop, metainfo, SVG app icon
  tests/                   # Integration tests (session)
  .github/workflows/       # CI: release.yml (Linux deb/AppImage, Windows exe, macOS dmg)
```

## Go backend methods (exposed to frontend)

- `GetSession()` — returns all notes, favorites, active ID
- `GetActiveContent()` / `GetNoteContent(id)` — read draft content
- `SetActive(id)` — switch active note
- `NewNote()` — create empty untitled note
- `UpdateContent(id, content)` — save draft, update title
- `SaveActive(content)` / `SaveAsDialog(content)` — save to disk
- `OpenFileDialog()` — open file via native OS dialog
- `ToggleStar(id)` — toggle bookmark/favorite
- `DeleteNote(id)` — remove unsaved note from session (saved files cannot be deleted)
- `ReorderNotes(ids)` — reorder notes by ID array (for drag-drop)
- `OpenPathFromBookmark(path)` — open a favorited file
- `GetHistory(id)` — list version snapshots for a note (newest first)
- `GetHistoryContent(id, timestamp)` — get full content of a specific snapshot
- `RestoreVersion(id, timestamp)` — restore a note to a previous version
- `OpenURL(url)` — open external URL in the system browser (not in webview)

## Tech constraints

- Use Go as the backend language.
- Use Wails v2 for the desktop shell (system webview, NOT Electron).
- Frontend is vanilla JS (no React/Vue/Svelte) to keep the bundle tiny and fast.
- Keep core file/session logic in Go, testable outside the GUI.
- All file I/O goes through Go backend methods exposed via Wails bindings.
- Frontend calls Go methods via `window.go.main.App.MethodName()`.
- Use native OS file dialogs from Wails runtime.
- Prefer standard-library Go for file IO, persistence, and tests.
- Do not add Electron, Tauri, or heavy JS frameworks.
- Build tags: `production,webkit2_41` for Linux production builds.

## UX principles

- Keep the app familiar: File, View, Help menus at the top (Wails native menus).
- Title bar shows "Markpad" when no file, filename when saved.
- Title should be "Untitled" for new notes until they are saved to a file.
- Sidebar on the left: Favorites (starred) section above Notes (session) section.
- Star icon beside each note in sidebar to toggle favorite.
- Drag-and-drop to reorder notes. Right-click context menu to star/delete.
- Three view modes: Editor, Split (side-by-side with resizable divider), Preview.
- Ctrl+Shift+E cycles through view modes.
- Formatting toolbar with SVG icon buttons above the editor.
- "not saved" indicator visible when content is dirty.
- Save button with accent color. Cancel button to revert.
- Native OS file picker for Open/Save/Save As.
- Help and About open as lightweight centered modals.
- All standard notepad shortcuts: Ctrl+S, Ctrl+Shift+S, Ctrl+N, Ctrl+O, Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+Del.
- Closing and reopening restores documents, drafts, favorites, and active note.
- Preview renders GitHub-style Markdown with syntax-highlighted code, tables, task lists.
- History panel (right sidebar): toggles with clock icon button or Ctrl+H. Shows timeline of saved versions with badges, timestamps, line/byte counts, and preview text. Click to view, hover to see Restore button.
- Find bar: Ctrl+F toggles inline search above editor. Enter for next match with wrap. Esc to close.
- Auto-list continuation: Enter in a list (-, *, 1., - [ ]) continues the pattern. Enter on empty prefix ends the list.
- External links in preview and modals open in the system browser via `OpenURL`.
- Per-note view mode memory: remembers editor/split/preview per note, defaults to Preview.
- File type icons in sidebar: shows emoji/text icon based on file extension.
- Reading time and word count in status bar.
- Save animation: button pulses on save. "NOT SAVED" indicator is bold and animated.

## Persistence rules

- Unsaved drafts live under the app config directory.
- Never discard unsaved user content without an explicit action.
- File saves must be atomic where possible.
- Save to existing file path when known.
- New untitled notes remain drafts until a save-as path is chosen.
- Keep bookmark/favorite paths absolute and deduplicated.
- Version history snapshots stored under `history/<doc-id>/` as timestamped JSON files.
- Each snapshot stores: timestamp, source (save/open/save-as/restore), content, bytes, lines, preview text.
- Max 50 snapshots per note; oldest are pruned automatically.
- Snapshots are created on: save, save-as, open, and restore.

## Performance rules

- Debounce Markdown rendering (120ms after last keystroke).
- Do not re-render preview if content hasn't changed.
- Keep CSS animations minimal and respect `prefers-reduced-motion`.
- Frontend JS should be under 50KB minified (excluding CDN libs).
- Keep the Go backend goroutine-lean.

## Code quality

- Run `gofmt` on changed Go files.
- Keep Go imports grouped and minimal.
- Frontend JS uses modern ES modules, clean function names.
- Add or update tests for session, file, and formatting logic.
- Do not weaken existing tests.
- Do not commit `dist/` build artifacts or `node_modules/`.

## Release/docs expectations

- Keep `README.md` useful for users and contributors.
- Keep `TODO.md` as the forward-looking roadmap.
- GitHub Pages website under `docs/` with Tailwind CSS, SEO, animations.
- MIT license.
- CI/CD via GitHub Actions for cross-platform builds (ubuntu-24.04, windows-latest, macos-latest).
