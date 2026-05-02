# Markpad

A tiny native Markdown notepad and local file viewer. Opens fast, saves your work, gets out of the way.

No Electron. No cloud. Single binary under 10 MB. Pure local, pure offline.

## Install

### Linux (one command)

```sh
curl -sL https://raw.githubusercontent.com/shreyam1008/markpad/main/install.sh | sh
```

This downloads the binary to `/usr/local/bin/markpad`, adds a desktop entry, and installs the icon. After that: type `markpad` in terminal or find it in your app launcher.

Or grab a package from [Releases](https://github.com/shreyam1008/markpad/releases):

| Format | How |
|--------|-----|
| `.deb` | `sudo dpkg -i markpad_*.deb` |
| `AppImage` | `chmod +x Markpad.AppImage && ./Markpad.AppImage` |

### Windows

Download the installer from [Releases](https://github.com/shreyam1008/markpad/releases) → `markpad-setup.exe`. Run it. Markpad appears in Start Menu and Desktop.

### macOS

Download `Markpad.dmg` from [Releases](https://github.com/shreyam1008/markpad/releases). Open, drag to Applications.

### Build from source

```sh
# Prerequisites: Go 1.24+, Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Linux: also install WebKit2GTK
sudo apt-get install libgtk-3-dev libwebkit2gtk-4.1-dev

wails build   # → build/bin/markpad (~8 MB)
wails dev     # development mode with hot reload
```

No other dependencies. The binary is fully self-contained.

## What It Does

- **Single instance** — Only one window. Opening another file adds it to the existing window
- **Open anything** — Markdown, text, code, config, logs, PDFs, images, ebooks, office docs, archives
- **PDF rendering** — Pages rendered via pdf.js (first 5 immediately, rest on demand). Lightweight, no bundled PDF engine
- **Image preview** — Inline image display for PNG, JPG, GIF, WebP, BMP, etc.
- **File verticals** — Markdown gets Editor/Split/Preview, code gets Edit/Code View, plain text opens in Editor, PDFs render in-app, images show inline, others get info cards
- **Split view** — Editor, side-by-side split, or preview. `Ctrl+Shift+E` to cycle
- **Version history** — Every save is a snapshot. Click any entry for a unified diff. Restore or go back. `Ctrl+H`
- **Session restore** — Close and reopen. Every note, draft, favorite, recently opened file comes back
- **Sidebar** — Favorites / Open / Recent sections. Star on left, close on right. Collapse sections, drag-and-drop reorder
- **Rich right-click** — Star, File Info, Open Folder, Copy Path, Close, Delete
- **File info** — Click (i) in the title bar for name, path, size, type, modified date, and Open Folder
- **Formatting toolbar** — Bold, italic, headings, code, links, images, lists, tables, blockquotes
- **Auto-list continuation** — Enter continues bullets, numbered lists, task lists. Empty prefix ends the list
- **Find** — `Ctrl+F` with wrap-around
- **Autosaved drafts** — Unsaved work survives app close
- **Status bar** — File type, line/word/char counts, reading time, encoding
- **In-app changelog** — Help > Changelog shows version history

## File Handling

Markpad stays lightweight by treating file families differently:

| Family | Behavior |
|--------|----------|
| Markdown | Editor, Split, Preview, formatting toolbar |
| Code/config | Fast plain editor plus syntax-highlighted Code View |
| Text/logs | Direct editor, simple stats |
| PDF | Page-by-page rendering via pdf.js CDN (first 5 pages, then load rest) |
| Image | Inline preview with Open Externally button |
| Ebook/office/archive | Read-only info card with Open Externally |

PDF pages render via a ~500 KB CDN library (pdf.js) loaded on demand. No PDF engine is bundled in the binary. Images are read via Go and displayed as base64 data URLs.

## Versions

| Version | Name | Highlights |
|---------|------|------------|
| 0.7 | Eklavya | Scroll position memory, extended syntax highlighting, performance, Open Folder fix, BUNDLE_BUDGET.md |
| 0.6 | Dhruva | Single instance, PDF rendering, image preview, file info, rich context menu, changelog |
| 0.5 | Chitrakala | File verticals, read-only cards, collapsible sidebar, preferences |
| 0.4 | Balram | Drag-and-drop file open, per-type view modes, expanded file icons |
| 0.3 | Aaradhya | Split view, formatting toolbar, drag reorder, syntax highlighting |
| 0.2 | | Version history, find, zoom, menus |
| 0.1 | | Initial release |

## Philosophy

Markpad exists because every "lightweight" editor ships 200 MB of Chromium. This one uses your OS's built-in webview. The binary is under 10 MB. Memory footprint stays low. There's no telemetry, no accounts, no sync, no internet access. Just a notepad.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New note |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+Shift+E` | Cycle view |
| `Ctrl+Shift+B` | Toggle sidebar |
| `Ctrl+H` | Version history |
| `Ctrl+F` | Find |
| `Ctrl+B/I/K` | Bold / Italic / Link |
| `Ctrl+Del` | Delete draft |
| `Esc` | Close panel |

## Storage

All data is local:

| Platform | Path |
|----------|------|
| Linux | `~/.config/markpad/` |
| macOS | `~/Library/Application Support/markpad/` |
| Windows | `%AppData%\markpad\` |

```
session.json    # notes, favorites, recents, active state
drafts/         # autosaved draft files
history/        # version snapshots (max 50 per note)
```

## Contributing

```sh
git clone https://github.com/shreyam1008/markpad.git
cd markpad
wails dev       # starts dev server with hot reload
```

- Go backend in `app.go` and `internal/session/`
- Frontend in `frontend/` — vanilla JS, Tailwind CSS, no build step
- Tests: `go test ./...`
- Format: `gofmt -w .`

PRs welcome. Keep it simple, keep it fast.

## Tech Stack

Go · Wails v2 · Vanilla JS · Tailwind CSS · marked.js · highlight.js · DOMPurify

## License

MIT. See [LICENSE](LICENSE).
