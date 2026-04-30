# Markpad

Markpad is a small native Markdown notepad written in Go. It keeps the Notepad feeling: open fast, type immediately, close without ceremony, and come back to the exact session later.

The current MVP uses Gio for a native Go UI and goldmark for CommonMark/GFM-compatible Markdown rendering support. The app has:

- A left sidebar of notes opened over time.
- Bookmarks for pinned file paths.
- Autosaved unsaved drafts stored in the user config directory.
- Per-note Markdown and Viewer tabs.
- Menus, Help, Tour, About, and Settings pages.
- Command-line opening for Markdown and plain text files.
- A deliberately light dependency shape: no Electron, no bundled browser runtime.

## Run

This environment has Go at `/usr/local/go/bin/go`. If `go` is on your `PATH`, use `go` instead.

On Linux, Gio needs native build headers before the desktop binary can compile:

```sh
sudo apt-get install gcc pkg-config libwayland-dev libx11-dev libx11-xcb-dev libxkbcommon-x11-dev libgles2-mesa-dev libegl1-mesa-dev libffi-dev libxcursor-dev libvulkan-dev
```

```sh
/usr/local/go/bin/go run ./cmd/markpad
/usr/local/go/bin/go run ./cmd/markpad README.md
```

## Build

```sh
make build
./dist/markpad README.md
```

On a Linux machine without the Gio header packages installed system-wide, this repo also has a non-root local build path:

```sh
make build-linux-local
./dist/markpad README.md
```

That command downloads the required `-dev` packages into `/tmp/markpad-apt`, extracts headers into `/tmp/markpad-sysroot`, and produces `dist/markpad`.

The current Linux binary built locally at about 7.5 MB stripped.

## Storage

Drafts and session metadata live under the platform config directory:

- Linux: `~/.config/markpad`
- macOS: `~/Library/Application Support/markpad`
- Windows: `%AppData%\markpad`

Unsaved notes are real draft files under `drafts/`, so closing the app should not lose work.

## Research Notes

Comparable projects influenced the product shape:

- MarkText proves the market still wants a simple, elegant cross-platform Markdown editor focused on speed and usability: https://github.com/marktext/marktext
- Ferrite highlights the key positioning: no Electron, low memory, and dual-pane source/rendered editing: https://getferrite.dev/
- Verso’s plain-file philosophy is the right default here: open `.md`, edit, close, no proprietary database: https://verso.imzl.com/
- Gio is the best fit for a Go-first native app with a future WASM route because it supports desktop platforms and WebAssembly while depending mainly on platform graphics/input libraries: https://gioui.org/
- goldmark is the Markdown parser choice because it is pure Go, CommonMark compliant, and includes GFM extensions: https://pkg.go.dev/github.com/yuin/goldmark

Full research summary: [docs/research/2026-04-30.md](docs/research/2026-04-30.md)

## Packaging

The repo includes GitHub Actions for:

- Linux binary, `.deb`, and AppImage
- Windows `.exe`
- macOS `.dmg`

Packaging is in `.github/workflows/release.yml`. Push a tag like `v0.1.0` to produce release artifacts.

## Current Boundaries

This is a native MVP, not the final giant-file editor. The TODO keeps the next technical steps explicit: file picker/save-as, rope or piece-table storage for huge files, synchronized scroll, and the WASM/web edition.
