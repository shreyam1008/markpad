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

- **Open broad file types** — Markdown, text, code, config, logs, PDFs, ebooks, office docs, images, archives
- **File verticals** — Markdown gets Editor/Split/Preview, code gets Edit/Code View, plain text opens in Editor, PDFs/ebooks/docs show read-only cards
- **Split view** — Editor, side-by-side split, or preview. `Ctrl+Shift+E` to cycle
- **Version history** — Every save is a snapshot. Click any entry for a unified diff. Restore or go back. `Ctrl+H`
- **Session restore** — Close and reopen. Every note, draft, favorite, recently opened file comes back
- **Sidebar** — Favorites / Open / Recent sections. Collapse sections, star files, close open files, drag-and-drop reorder active files
- **Formatting toolbar** — Bold, italic, headings, code, links, images, lists, tables, blockquotes
- **Auto-list continuation** — Enter continues bullets, numbered lists, task lists. Empty prefix ends the list
- **Find** — `Ctrl+F` with wrap-around
- **Autosaved drafts** — Unsaved work survives app close
- **File type icons, missing recent detection, word count, reading time, save animation, per-note view memory**

## File Handling

Markpad stays lightweight by treating file families differently:

| Family | Behavior |
|--------|----------|
| Markdown | Editor, Split, Preview, formatting toolbar |
| Code/config | Fast plain editor plus syntax-highlighted Code View |
| Text/logs | Direct editor, simple stats |
| PDF/ebook/office/image/archive | Read-only card with size/path and Open Externally |

PDF rendering is intentionally delegated to the system viewer instead of bundling a heavy PDF engine. This keeps startup fast, memory low, and the binary small.

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
