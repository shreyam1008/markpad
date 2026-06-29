# Security Model

This document explains how ZenNotes approaches security across desktop, web, and self-hosted deployment.

It is intentionally candid. The goal is not to sound maximally hardened. The goal is to explain what ZenNotes actually protects, what it assumes, and where the current boundaries are.

## The core security assumption

ZenNotes is easiest to reason about when you treat it as:

- a single-user notes system
- built around plain files on disk
- optionally reachable over a network through a trusted self-hosted server

That assumption shapes almost every security choice.

ZenNotes is not currently built as:

- a public multi-tenant SaaS security boundary first
- a zero-trust collaboration system
- a product that expects arbitrary untrusted browser clients and untrusted filesystem tenants

## Why the security model changed

When ZenNotes was effectively only a local desktop app, the threat model was simpler.

Once ZenNotes gained:

- a self-hosted browser mode
- a Go server
- desktop remote workspaces
- Docker deployment

the old assumptions stopped being good enough.

The biggest changes were:

- moving browser auth to session cookies
- treating browse roots as real authorization boundaries
- separating host config from vault config
- keeping desktop remote credentials out of renderer-visible state
- making Docker defaults more restrictive

## The system has three main trust zones

### 1. Local desktop runtime

The desktop app is still a trusted local application.

It can:

- access the local vault directly
- talk to the remote server from the main process
- use native integrations

Its protection story is mostly about:

- isolating the renderer from privileged APIs
- preventing untrusted renderers from using privileged IPC
- storing secrets outside plain config where possible

### 2. Self-hosted server

The Go server is the trust boundary for browser access.

It is responsible for:

- authenticating clients
- scoping accessible filesystem roots
- validating origins
- serving only what the browser should get

The server is where a browser request becomes a filesystem operation, so the server boundary matters more than the client boundary in self-hosted mode.

### 3. Host filesystem

The host filesystem is the real source of truth for notes.

That is a product strength, but it also means security is not only about HTTP. It is also about:

- what directories the server can reach
- whether Docker mounts are scoped correctly
- where secrets are stored
- whether the app accidentally writes sensitive operational config into a synced vault

## Why browser auth uses sessions now

Using a bootstrap token in URLs or long-lived browser storage creates avoidable leakage points.

So the current browser model is:

1. the user enters a bootstrap token once
2. the server verifies it
3. the server issues a random session
4. the browser continues with an `HttpOnly` cookie

This matters because it reduces exposure through:

- local storage
- copied URLs
- logs and history
- accidental token reuse in browser-visible state

It is not full identity and account management. It is a tighter single-user session model.

## Why browse roots matter so much

ZenNotes now has a server-side directory browser and remote vault switching.

That is useful, but it is also the most obvious place where convenience can turn into overreach.

So the current design treats browse roots as a real boundary:

- resolve the requested path
- resolve symlinks
- reject anything outside allowed roots

This is one of the most important practical controls in the self-hosted product, because it narrows what a remote client can even ask the server to consider a vault.

## Why path resolution applies inside the vault too

Browse-root checking decides which roots can be vaults. Once a vault
is selected, the server still has to translate browser-supplied
relative paths (a note path, an asset path, a folder name) into real
file operations. That second translation is its own boundary.

Current behavior on every note/asset/folder request:

- the user-supplied relative path is cleaned and joined onto the vault root
- each existing path component is `Lstat`-ed; any symbolic link is
  resolved and must still resolve to something inside the canonical
  vault root
- if any link points outside the root, the request is rejected with a
  path-escape error before any read or write happens

This matters because plain text-only path checks ("does the cleaned
path stay under root?") quietly miss the case where a symlink already
exists inside the vault — for example, on a shared mount, a recovered
backup, or a vault that the user manages with other tools. Without the
symlink-aware check, a link inside the vault pointing at `/etc/hosts`
would be treated as "inside the vault" by the lexical check and the
server would happily read or write through it.

## What the server caps

The server applies a few flat ceilings to keep an authenticated
client (or stolen token) from making the host unusable:

- per-request body size for `POST /api/notes/write` (default 10 MiB)
- per-request body size for `POST /api/assets/upload` (default 50 MiB)
- short exponential backoff between repeated login attempts
- file modes `0600` for notes and `0700` for directories on Unix hosts

These are not the primary defense against compromise. They are the
"don't make a single bad request infinitely expensive" floor.

## Why Docker is part of the security story

Docker is not only a convenience story for ZenNotes. It is also part of the security posture.

The current default container setup:

- binds the host port to loopback
- runs non-root
- drops Linux capabilities
- uses `no-new-privileges`
- keeps the root filesystem read-only
- uses base images pinned by digest so the build doesn't drift on a
  fresh `docker pull`

This does not make Docker magically secure. But it does mean the default self-hosted path is narrower and safer than a broad all-interfaces, writable-root, root-running container.

## Why TLS is the operator's responsibility

The Go server doesn't terminate TLS itself. That keeps the binary
small and the deployment pluggable, but it also means the server has
no way to *know* whether traffic is encrypted unless the operator
tells it.

The current design treats TLS as a deployment fact, declared by the
operator:

- `ZENNOTES_BEHIND_TLS=1` says "a TLS-terminating proxy is in front."
  Cookies get the `Secure` flag, the server emits
  `Strict-Transport-Security`, and the startup banner stops warning.
- `ZENNOTES_TRUSTED_PROXIES` (a CIDR list) controls which TCP peers
  may set `X-Forwarded-Proto`, `X-Forwarded-Host`, and
  `X-Forwarded-For`. Without this, those headers are ignored even if
  the proxy sends them — which is the right default, because a
  publicly reachable plain-HTTP server would otherwise let any client
  flip the `Secure` flag or spoof the rate-limit identity.

If neither knob is set and the bind is non-loopback, the server logs
loud, repeating warnings on startup and every 15 minutes thereafter.
This is preferable to silently accepting an exposed plain-HTTP setup
that *looks* fine until something goes wrong.

## Why desktop secrets stay in the main process

For remote workspaces, the risky design would be:

- renderer holds raw server token
- renderer fetches server directly

ZenNotes instead pushes that work toward:

- main-process networking
- main-process asset proxying
- secret-store-backed credential persistence

That is the right direction because the legacy desktop runtime renderer should not be treated as the place where you casually keep long-lived remote credentials.

## Why the vault must not store server secrets

ZenNotes intentionally supports:

- shared mounted vaults
- synced vaults
- desktop plus browser against the same files

That means the vault is a terrible place to hide operational server secrets.

So the current direction is:

- vault stores vault behavior
- host config stores host/server operations and auth secrets

That separation is fundamental. Without it, the product would keep smuggling server operational state into the same content tree users want to sync and inspect.

## The current honest limitations

ZenNotes is more hardened than before, but a few important tradeoffs remain.

### legacy desktop runtime sandboxing is not fully done

Desktop currently keeps:

- `contextIsolation: true`
- `nodeIntegration: false`

but still uses:

- `sandbox: false`

That is not ideal. It is an acknowledged technical debt item driven by the current preload path.

### CSP still has exceptions

The current CSP is materially better than a meta-tag-only approach, but it still contains:

- `unsafe-eval`
- `unsafe-inline` for styles

That reflects the current rendering/editor stack, not an ideal end state.

### The product is not pretending to be multi-tenant SaaS-hard

ZenNotes is strongest today when used as:

- local desktop app
- single-user self-hosted web app
- remote desktop-to-server setup in a trusted deployment

That is the practical security promise.

## The right mental model for operators

If you are deploying ZenNotes for browser use, think like this:

- the server is privileged
- the mounted vault is valuable
- the browser is a client, not the authority
- the reverse proxy is your public perimeter if you expose it remotely

That model will lead you to the right defaults more often than treating ZenNotes like a static web app that happens to read files somewhere.

## Related docs

- [Security Reference](../reference/security-reference.md)
- [Secure Self-Hosting](../how-to/secure-self-hosting.md)
- [How ZenNotes Works](./how-zennotes-works.md)
