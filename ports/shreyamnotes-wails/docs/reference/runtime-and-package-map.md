# Runtime and Package Map

This document describes the current ShreyamNotes Wails/WebKitGTK port layout and what each major app/package is responsible for.

ShreyamNotes started from [`ZenNotes/zennotes`](https://github.com/ZenNotes/zennotes). The shared product code and package names still carry ZenNotes history, but this port's desktop runtime, packaging path, branding, and performance work target ShreyamNotes.

## Top-level layout

```text
apps/
  web/
  server/
    cmd/
      shreyamnotes-wails/
      zennotes-server/
    internal/
packages/
  app-core/
  bridge-contract/
  shared-domain/
  shared-ui/
tooling/
  scripts/
bench/
docs/
integrations/
  raycast/
```

There is no `apps/desktop` workspace in this port. The copied legacy desktop shell has been removed; the desktop app is built from the Wails command in `apps/server/cmd/shreyamnotes-wails`.

## apps/server

`apps/server` contains both the reusable Go backend and the Wails/WebKitGTK desktop entrypoint.

The Wails command lives at `apps/server/cmd/shreyamnotes-wails` so it can legally import the server's `internal/*` packages. It embeds the built `apps/web` bundle, serves it through Wails' asset server, and routes `/api` calls through the same Go HTTP router used by the self-hosted server.

Responsibilities:

- Wails v2/WebKitGTK desktop window lifecycle
- native desktop menus and Wails event emission
- ShreyamNotes desktop defaults for config and vault location
- embedded web bundle for the desktop app
- HTTP API and WebSocket watch stream
- vault access on the host filesystem
- directory browsing and vault selection
- auth/session flow for server mode
- security headers and CORS/origin checks
- server binary for self-hosted browser use

Important commands:

- `make wails-run`
- `make wails-build`
- `make wails-size`
- `bun run dev:server`
- `bun --filter @zennotes/server build`
- `go -C apps/server test ./...`

## apps/web

`apps/web` is the browser frontend shell.

Responsibilities:

- Vite development/build pipeline
- browser bootstrapping
- PWA assets and service worker registration
- HTTP bridge that implements the shared `window.zen` API shape
- export-window browser entrypoint

Important point:

The web app does not reimplement the product UI. It mounts the shared UI from `packages/app-core`.

Important commands:

- `bun run dev:web`
- `bun --filter @zennotes/web build`
- `make web-build`

## packages/app-core

`packages/app-core` is the source of truth for user-facing product behavior.

Responsibilities:

- React app shell
- Zustand store
- editor panes
- preview
- command palette
- sidebar
- settings modal
- tags/tasks/archive/trash views
- quick notes
- folder icons and sidebar customization
- shared app behavior across Wails desktop and browser/server modes

If a feature should behave the same in the Wails app and the browser, it should usually live here.

## packages/bridge-contract

`packages/bridge-contract` defines the runtime contract between the shared UI and the host.

It describes:

- app info and capabilities
- vault operations
- remote workspace operations
- session operations
- update state
- watchers and events
- template helpers

The UI depends on this interface instead of depending directly on Wails APIs or raw fetch calls.

## packages/shared-domain

`packages/shared-domain` contains shared types and models that are not renderer-specific.

Examples:

- app config
- tasks and task lists
- tags
- archive/trash/quick notes models
- database transforms
- Excalidraw helpers
- MCP client state
- shared domain types used across runtimes

## packages/shared-ui

`packages/shared-ui` is intentionally small today.

It exists as the place for UI primitives that are reusable without dragging in the whole app.

## tooling/scripts

`tooling/scripts` contains repo-level helpers used by workspaces, local development, builds, and benchmarks.

Examples:

- Go server build/test/dev wrappers
- web stack orchestration
- web dist syncing/preparation scripts
- performance measurement scripts

## bench

`bench` contains repeatable local benchmark tooling and recorded results for the Wails/WebKitGTK port.

Examples:

- synthetic vault generation
- Linux desktop benchmark runner
- benchmark result summaries

## Runtime model

ShreyamNotes currently runs in two product modes.

### Wails desktop

- UI from `packages/app-core`
- browser shell from the built `apps/web` bundle
- host bridge implemented through the HTTP bridge and Go router
- local vault access through `apps/server/internal/vault`
- desktop window/menu lifecycle from `apps/server/cmd/shreyamnotes-wails`

### Self-hosted web

- UI from `packages/app-core`
- browser shell from `apps/web`
- host bridge from the HTTP implementation
- backend from `apps/server/cmd/zennotes-server` and `apps/server/internal/*`

## What should go where?

As a rule:

- shared user-facing behavior -> `packages/app-core`
- runtime contract -> `packages/bridge-contract`
- shared note/task/config models -> `packages/shared-domain`
- reusable UI primitives -> `packages/shared-ui`
- Wails/WebKitGTK desktop shell concerns -> `apps/server/cmd/shreyamnotes-wails`
- browser-only bootstrapping and PWA concerns -> `apps/web`
- server-side vault/network/security behavior -> `apps/server/internal`
- repo build, dev, and benchmark helpers -> `tooling/scripts` and `bench`

## Related docs

- [Monorepo Architecture](../monorepo-architecture.md)
- [Web Architecture](../web-architecture.md)
- [How ZenNotes Works](../explanation/how-zennotes-works.md)
