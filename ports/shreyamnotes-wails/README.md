# ShreyamNotes

<p align="center">
  <img src="apps/web/public/icon-512.png" alt="ShreyamNotes app icon" width="160">
</p>

ShreyamNotes is a Wails/WebKitGTK port of ZenNotes. The current goal is a small, fast desktop notes app backed by Go, a shared React app core, and plain Markdown files on disk.

This port keeps attribution clear: it started from [`ZenNotes/zennotes`](https://github.com/ZenNotes/zennotes), but the runtime shell, packaging path, branding, and performance work now target ShreyamNotes.

## What It Is For

- Plain-file Markdown notes without a hidden content database.
- Sidebar-first navigation with recents, favorites, lifecycle views, tasks, tags, and quick notes.
- CodeMirror editing, live preview, syntax-highlighted code blocks, math, diagrams, wiki links, callouts, and local embeds.
- A Wails desktop app for low startup time, low idle memory, and small binaries.
- A Go server path for self-hosted and future sync/MCP work.

## Layout

```text
apps/
  web/                         Vite frontend shell
  server/                      Go backend and Wails command
    cmd/shreyamnotes-wails/    Wails desktop entrypoint
packages/
  app-core/                    Shared React product core
  bridge-contract/             window.zen runtime contract
  shared-domain/               Shared note/task/config types
tooling/
  scripts/                     Perf, build, and local dev helpers
docs/
  porting/                     Porting notes, metrics, and phase logs
```

## Local Development

```sh
bun install
make wails-run
```

Useful checks:

```sh
bun run typecheck
bun --filter @zennotes/app-core test:run
go -C apps/server test ./...
make wails-build
```

## Performance Work

Benchmarks and repeatable local measurements live in `bench/` and `docs/porting/`.

The port tracks:

- build wall time and peak RSS
- binary size
- startup time
- idle PSS/USS/RSS
- large-vault startup and memory with thousands of notes and large files

## Current Product Notes

- The desktop runtime is Wails/WebKitGTK.
- The old desktop workspace has been removed from this port.
- Auto-update remains a first-class feature, implemented through the Go/Wails path.
- Vim-style workflows are available where useful, but Vim mode is no longer the default.
- Tabs are no longer the primary workflow; the app is moving toward sidebar-first active/recents/favorites navigation.
