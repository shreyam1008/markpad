# Markpad

A tiny native Markdown notepad. Opens fast, saves your work, gets out of the way.

No Electron. No cloud. Single binary under 10 MB. Pure local, pure offline.

## Install

| Platform | Download | How |
|----------|----------|-----|
| **Linux** | [AppImage](https://github.com/shreyam1008/markpad/releases) | Portable — download, `chmod +x`, run |
| **Linux** | [.deb](https://github.com/shreyam1008/markpad/releases) | `sudo dpkg -i markpad_*.deb` |
| **Windows** | [.exe](https://github.com/shreyam1008/markpad/releases) | Portable zip — extract, run |
| **macOS** | [.dmg](https://github.com/shreyam1008/markpad/releases) | Drag to Applications |

Or build from source:

```sh
# Prerequisites: Go 1.21+, Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Linux: also install WebKit2GTK
sudo apt-get install libgtk-3-dev libwebkit2gtk-4.1-dev

wails build   # → build/bin/markpad (~8 MB)
wails dev     # development mode with hot reload
```

## What It Does

- **Open anything** — `.md`, `.txt`, `.json`, `.yaml`, `.py`, `.go`, `.js`, `.html`, `.css`, code, config, logs
- **Code files get syntax highlighting** — language-aware via highlight.js, no markdown preview clutter
- **Split view** — Editor, side-by-side split, or preview. `Ctrl+Shift+E` to cycle
- **Version history** — Every save is a snapshot. Click any entry for a unified diff. Restore or go back. `Ctrl+H`
- **Session restore** — Close and reopen. Every note, draft, favorite, recently opened file comes back
- **Sidebar** — Favorites / Open / Recent sections. Star, drag-and-drop reorder, right-click context menu
- **Formatting toolbar** — Bold, italic, headings, code, links, images, lists, tables, blockquotes
- **Auto-list continuation** — Enter continues bullets, numbered lists, task lists. Empty prefix ends the list
- **Find** — `Ctrl+F` with wrap-around
- **Autosaved drafts** — Unsaved work survives app close
- **File type icons, word count, reading time, save animation, per-note view memory**

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
