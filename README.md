# Markpad

A tiny native Markdown notepad built with **Go + Wails**. Opens fast, saves your work, and gets out of the way.

No Electron. System webview. Single binary under 10 MB.

## Features

- **Split View** — Editor, Split (side-by-side with resizable divider), and Preview modes. `Ctrl+Shift+E` to cycle.
- **Open Anything** — `.md`, `.txt`, `.json`, `.yaml`, `.py`, `.go`, `.js`, `.sh`, `.html`, `.css`, `.svg`, code, config, logs, and more.
- **Session Restore** — Close and reopen. Every note, draft, favorite, and active document comes back exactly as you left it.
- **Version History** — Every save creates a snapshot. Click the clock icon to browse all versions in a right-side timeline panel. Preview and restore any old version instantly. `Ctrl+H` to toggle.
- **Favorites & Drag-and-Drop** — Star notes for quick access. Drag to reorder. Right-click context menu.
- **Formatting Toolbar** — Bold, italic, strikethrough, headings, code, links, images, lists, tables, blockquotes. All with SVG icon buttons and keyboard shortcuts.
- **Auto-List Continuation** — Press Enter in a list (`-`, `*`, `1.`, `- [ ]`) and the pattern continues. Enter on an empty item ends the list.
- **Find in Editor** — `Ctrl+F` to search with wrap-around.
- **External Links** — Links in the preview and modals open in your system browser, not the app.
- **Autosaved Drafts** — Unsaved work survives app close. Drafts live under the config directory.
- **Save Animation** — Smooth visual pulse on save. Bold "NOT SAVED" indicator when dirty.
- **File Type Icons** — Each note shows an icon based on its file extension.
- **Per-Note View Memory** — Remembers which view mode (editor/split/preview) you used for each note.
- **Word Count & Reading Time** — Status bar shows lines, words, characters, and estimated reading time.
- **Native Dialogs** — OS file picker for Open, Save, Save As.
- **Keyboard Shortcuts** — `Ctrl+S`, `Ctrl+N`, `Ctrl+O`, `Ctrl+Shift+S`, `Ctrl+B/I/K`, `Ctrl+F`, `Ctrl+H`, `Ctrl+Del`, and more.

## Install

Download from the [Releases page](https://github.com/shreyam1008/markpad/releases):

- **Linux**: AppImage (portable) or `.deb` (Debian/Ubuntu)
- **Windows**: `.exe` (portable zip)
- **macOS**: `.dmg` (Apple Silicon + Intel)

## Build from Source

**Prerequisites**: Go 1.21+, Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

On Linux, install WebKit2GTK:

```sh
sudo apt-get install libgtk-3-dev libwebkit2gtk-4.1-dev
```

Build and run:

```sh
wails dev     # development mode with hot reload
wails build   # production binary in build/bin/
```

Or with `make`:

```sh
make dev      # wails dev
make build    # production build
```

The production binary is ~8 MB stripped.

## Storage

All data is local. Drafts, session state, and version history live under the platform config directory:

- **Linux**: `~/.config/markpad/`
- **macOS**: `~/Library/Application Support/markpad/`
- **Windows**: `%AppData%\markpad\`

```
markpad/
  session.json          # notes, favorites, active state
  drafts/               # autosaved draft files
  history/<doc-id>/     # version snapshots (JSON, max 50 per note)
```

## Architecture

```
markpad/
  main.go               # Wails app entry, window config, native menus
  app.go                 # Go backend: session, file ops, history, exposed to JS
  internal/session/      # Session persistence, drafts, bookmarks, version history
  frontend/
    index.html           # Single-page app shell (Tailwind + CDN libs)
    src/main.js          # All frontend logic: editor, preview, toolbar, sidebar, history
    src/styles.css       # Minimal custom CSS
  docs/                  # GitHub Pages website
  packaging/             # Linux .desktop, metainfo, SVG icon
```

**Tech stack**: Go · Wails v2 · Vanilla JS · Tailwind CSS · marked.js · highlight.js · DOMPurify

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New note |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+Shift+E` | Cycle view mode |
| `Ctrl+Shift+B` | Toggle sidebar |
| `Ctrl+H` | Toggle version history |
| `Ctrl+F` | Find in editor |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Link |
| `Ctrl+Del` | Delete draft |
| `Esc` | Close modal / find / history |

## License

MIT. See [LICENSE](LICENSE).
