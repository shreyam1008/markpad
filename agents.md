# Markpad Agent Guide

This file is the working contract for AI agents contributing to Markpad.

## Product intent

Markpad is a small native Markdown notepad/viewer built with **Wails v2** (Go backend + web frontend using the OS native webview). It should feel as immediate as a traditional Notepad or Mousepad-style desktop app, while adding a polished Markdown viewer, session restore, a formatting toolbar, and a modern but quiet interface.

The core promise is:

- Native desktop app powered by Go + system webview (NOT Electron).
- Small binary (target <15 MB with embedded frontend assets).
- Low idle memory and stable behavior with large text files.
- Plain files stay plain: `.md`, `.markdown`, `.txt`, logs, and other text-like files.
- Unsaved work survives app close through local drafts.
- Native OS file dialogs for Open, Save, Save As.
- Full keyboard shortcuts (Ctrl+S, Ctrl+N, Ctrl+O, Ctrl+Shift+V, etc.).
- Beautiful GitHub-style Markdown rendering via `marked.js` + `highlight.js`.
- Markdown formatting toolbar (bold, italic, heading, code, table, list, link, image).
- Star/favorite notes in sidebar.
- Web/WASM edition is planned later using the same frontend code.

## Tech stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Go + Wails v2 | Lightweight native app, OS webview, native dialogs |
| Frontend | Vanilla HTML/CSS/JS (no framework) | Minimal bundle, fast load, easy to maintain |
| Styling | Tailwind CSS (CDN or built) | Utility-first, clean, responsive |
| Markdown | marked.js + highlight.js + DOMPurify | GitHub-style rendering, syntax highlighting, XSS safe |
| Icons | Lucide (SVG) or Bootstrap Icons (CDN) | Lightweight icon set |
| Session | Go JSON persistence in app config dir | Same as before |

## Architecture

```
markpad/
  main.go                  # Wails app entry, window config, menus
  app.go                   # Go backend: session, file ops, exposed to frontend
  internal/
    session/               # Session persistence, drafts, bookmarks (KEEP existing)
  frontend/
    index.html             # Single-page app shell
    src/
      main.js              # App initialization, Wails bindings
      editor.js            # CodeMirror or textarea editor logic
      preview.js           # marked.js rendering pipeline
      toolbar.js           # Formatting toolbar actions
      sidebar.js           # Sidebar: favorites + session notes
      shortcuts.js         # Keyboard shortcut handler
      styles.css           # Tailwind + custom styles
  docs/                    # GitHub Pages website (separate from app)
  packaging/               # Linux .desktop, metainfo, icons
```

## Tech constraints

- Use Go as the backend language.
- Use Wails v2 for the desktop shell (system webview, NOT Electron).
- Frontend is vanilla JS (no React/Vue/Svelte) to keep the bundle tiny and fast.
- Keep core file/session logic in Go, testable outside the GUI.
- All file I/O goes through Go backend methods exposed via Wails bindings.
- Frontend calls Go methods via `window.go.main.App.MethodName()`.
- Use native OS file dialogs from Wails runtime (`runtime.OpenFileDialog`, `runtime.SaveFileDialog`).
- Prefer standard-library Go for file IO, persistence, and tests.
- Do not add Electron, Tauri, or heavy JS frameworks.

## UX principles

- Keep the app familiar: File, View, Help menus at the top (Wails native menus).
- Title bar shows "Markpad" when no file, filename when saved.
- Title should be "Untitled" for new notes until they are saved to a file.
- Sidebar on the left: Favorites (starred) section above Notes (session) section.
- Star icon beside each note in sidebar to toggle favorite.
- Editor area with formatting toolbar above the textarea/editor.
- Markdown and Viewer tabs to switch modes (shortcut: Ctrl+Shift+V).
- "not saved" indicator visible when content is dirty.
- Save button with accent color. Cancel button to revert.
- Native OS file picker for Open/Save/Save As (not a text box).
- Help and About open as lightweight centered modals.
- All standard notepad shortcuts: Ctrl+S (save), Ctrl+Shift+S (save as), Ctrl+N (new), Ctrl+O (open), Ctrl+Z/Y (undo/redo), Ctrl+B (bold), Ctrl+I (italic).
- Closing and reopening restores documents, drafts, favorites, and active note.
- Viewer mode renders beautiful GitHub-style Markdown with syntax-highlighted code, tables, task lists.

## Persistence rules

- Unsaved drafts live under the app config directory.
- Never discard unsaved user content without an explicit action.
- File saves must be atomic where possible.
- Save to existing file path when known.
- New untitled notes remain drafts until a save-as path is chosen.
- Keep bookmark/favorite paths absolute and deduplicated.

## Performance rules

- Debounce Markdown rendering (100-200ms after last keystroke).
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
- Docs under `docs/` for architecture, packaging, launch.
- GitHub Pages website under `docs/` with SEO, downloads, branding.
- MIT license.
- CI/CD via GitHub Actions for cross-platform builds.
