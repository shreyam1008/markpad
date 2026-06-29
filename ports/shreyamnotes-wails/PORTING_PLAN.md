# ShreyamNotes Wails Port

This folder is an isolated ZenNotes-to-Wails port. The current Markpad root is not part of this experiment until a phase is explicitly promoted back.

## Phase Plan

1. **Phase 1: Wails parity shell**
   - Keep upstream ZenNotes React app/core unchanged.
   - Replace the legacy desktop runtime container with a Wails v2 shell.
   - Reuse ZenNotes' existing Go vault/server router for file, task, search, asset, and watch APIs.
   - Verify the app boots, renders the shared UI, and edits a local vault through the HTTP bridge.

2. **Phase 2: trim and brand**
   - Remove legacy desktop runtime-only runtime surfaces.
   - Keep normal shortcuts, command palette, and editor shortcuts.
   - Reduce Vim-first behavior without breaking existing keyboard flows.
   - Rename visible product shell to `ShreyamNotes` as a placeholder.

3. **Phase 3: sidebar-first workflow**
   - Remove tab-strip-first UX.
   - Treat sidebar items as active/open surfaces.
   - Move closed files into Recents.
   - Keep Favorites pinned near the top.
   - Keep Tasks and Quick Notes unchanged until the workflow stabilizes.

4. **Phase 4: updater and sync**
   - Replace legacy desktop runtime updater with a Go updater path.
   - Default the release provider to `github.com/shreyam1008/...`.
   - Keep update checks signed/verifiable before enabling automatic replacement.
   - Remove ZenNotes remote-workspace conventions and design a local-first sync boundary.

5. **Phase 5: promote back**
   - Compare Wails and legacy desktop runtime startup, memory, process count, and package size.
   - Keep only the winning port slices.
   - Merge back into the main Markpad tree after screenshots, tests, and benchmark artifacts are reviewed.

## Current Phase 1 Shape

The Wails shell lives at:

```text
apps/server/cmd/shreyamnotes-wails
```

It sits under `apps/server` so Go can legally import ZenNotes' `apps/server/internal/*` packages. The shell embeds the built `apps/web` bundle and routes `/api` calls through the existing Go HTTP router.

Build and run:

```sh
bun install --frozen-lockfile
make wails-build
make wails-run
make wails-size
```

The default desktop config and vault are isolated from upstream ZenNotes:

```text
config: $XDG_CONFIG_HOME/ShreyamNotes/server.json
vault:  ~/ShreyamNotesVault
```

Override with the existing ZenNotes env vars when needed:

```sh
ZENNOTES_CONFIG_PATH=/tmp/shreyamnotes/server.json \
ZENNOTES_VAULT_PATH=/tmp/shreyamnotes/vault \
make wails-run
```

## Updater Direction

Wails v2 does not provide a first-party auto-updater. Phase 1 keeps the app runnable and records the replacement path:

- check GitHub Releases from Go
- hardcode owner/repo to the future `shreyam1008` release repo
- verify SHA256 first
- add signature verification before automatic install
- use package-manager updates as the fallback path for Linux packages

Wails v3 has a first-party updater, but it is still alpha. Treat v3 as a separate spike, not the Phase 1 baseline.

## Performance Gates

Every phase should record:

- startup wall time to DOM-ready probe
- process count at ready and max process count
- process-tree RSS, PSS, and USS
- executable bytes
- installed directory/package bytes
- screenshot proof that the UI booted and core controls render

legacy desktop runtime comparisons must use packaged ZenNotes, not legacy desktop runtime dev mode.
