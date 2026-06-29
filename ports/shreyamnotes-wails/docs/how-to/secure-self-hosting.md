# Secure Self-Hosting

This guide explains how to run ZenNotes in the browser with the current security model in mind.

It is written for people who are deploying ZenNotes:

- on a home server
- on a private VPS
- behind a reverse proxy
- in Docker

It is not a vulnerability reporting guide. For that, see the repo-level [SECURITY.md](../../SECURITY.md).

## The recommended deployment model

ZenNotes is currently designed around a single-user self-hosted model first.

The safest supported shape today is:

1. run ZenNotes with Docker
2. keep the server bound to loopback unless you intentionally expose it
3. put it behind a reverse proxy if you want remote browser access
4. use the generated auth token or a configured `ZENNOTES_AUTH_TOKEN`
5. mount a host-owned vault directory into the container

This matches the product’s intended model:

- your notes live on the host
- Docker serves them
- the browser app authenticates to the server

## 1. Start from Docker defaults

The current Docker setup already hardens a few important things by default.

From the repo root:

```bash
CONTENT_ROOT="$HOME/Notes/ZenNotesVault" make up
```

Important defaults:

- host port is bound to `127.0.0.1`
- a bootstrap auth token is generated and persisted under `data/auth-token`
- the container runs as a non-root UID/GID
- the root filesystem is read-only
- capabilities are dropped
- `no-new-privileges` is enabled

If you can stay inside this model, do.

## 2. Keep the vault on the host

Create or choose a host directory for the vault.

Example:

```bash
mkdir -p "$HOME/Notes/ZenNotesVault"
```

Then mount it with:

```bash
CONTENT_ROOT="$HOME/Notes/ZenNotesVault" make up
```

This matters for security and recoverability:

- you can inspect and back up your notes outside Docker
- the vault is not trapped in container-only storage
- other trusted tools can work against the same files if you want them to

## 3. Use the auth token

When secure defaults are enabled, ZenNotes writes a bootstrap token to:

- `data/auth-token`

Read it with:

```bash
cat data/auth-token
```

The browser login flow now works like this:

1. you enter the bootstrap token once
2. the server validates it
3. the server sets an `HttpOnly` session cookie
4. the browser uses that cookie on later requests

That means:

- the browser should not need `?authToken=...`
- the browser should not rely on local storage for the auth token

## 4. Prefer HTTPS when exposing ZenNotes remotely

ZenNotes is acceptable behind a trusted private-network or reverse-proxy setup, but if you want browser access from outside your LAN, use HTTPS at the proxy layer.

Why:

- session cookies can be marked `Secure` when the request is effectively HTTPS
- remote access is safer with transport encryption and a real host boundary

Current guidance:

- terminate TLS in Caddy, Nginx, Traefik, or another reverse proxy
- forward traffic to ZenNotes on loopback
- set `ZENNOTES_BEHIND_TLS=1` so the server marks cookies `Secure`
  and emits `Strict-Transport-Security`
- set `ZENNOTES_TRUSTED_PROXIES` to your proxy's CIDR (e.g.
  `127.0.0.1/32` or the bridge network) so `X-Forwarded-*` headers
  from the proxy are honoured but spoofed headers from anyone else
  are ignored

## 5. Restrict what the server can browse

ZenNotes now treats browse roots as a real authorization boundary.

Practical rule:

- only mount the directories you actually want the server to see
- keep `ZENNOTES_BROWSE_ROOTS` scoped to those directories

That reduces the blast radius if:

- you choose the wrong folder
- the app is misconfigured
- a future bug appears in vault browsing or selection

## 6. Keep the server private unless you mean to expose it

Current Docker defaults bind the port to loopback:

- `127.0.0.1:${PORT}:7878`

That is a good default.

If you later expose the server:

- do it intentionally
- keep auth enabled
- prefer a reverse proxy
- do not treat the raw Go server as your internet-facing security perimeter

## 7. Do not opt out of auth unless you really mean it

There is an insecure escape hatch:

- `ALLOW_INSECURE_NOAUTH=1`

Use it only for truly local or throwaway test cases.

It is not the right default for a persistent home-server deployment.

## 8. Understand what desktop remote mode does

Desktop remote mode does not turn the renderer into an arbitrary network client.

Instead:

- the legacy desktop runtime main process talks to the ZenNotes server
- the renderer talks to the main process through the bridge

This is better than putting raw server credentials directly into renderer logic.

## 9. Know the current security tradeoffs

ZenNotes is hardened more than it used to be, but it is not pretending to be finished.

Current important tradeoffs:

- legacy desktop runtime `contextIsolation` is on and `nodeIntegration` is off
- desktop IPC sender validation exists
- desktop still runs with `sandbox: false` today because the preload path has not been fully refactored for a sandboxed preload
- server CSP is sent by header, but still includes `unsafe-eval` and `unsafe-inline` for the current stack

So the honest recommendation is:

- good for single-user self-hosting behind a private-network or reverse-proxy model
- not yet something to expose casually as a hardened public multi-user web app

## 10. A good production-ish self-hosted checklist

- keep the vault on the host
- use Docker defaults
- keep auth enabled
- keep the service on loopback
- put it behind HTTPS if accessed remotely
- set `ZENNOTES_BEHIND_TLS=1` and `ZENNOTES_TRUSTED_PROXIES` once a
  reverse proxy is in place
- scope browse roots narrowly
- back up the host vault, not just the container — encrypt those
  backups, see [At-Rest Encryption](./at-rest-encryption.md)
- rotate the auth token periodically in its source of truth; use
  `POST /api/session/rotate-token` only for host-config-managed tokens,
  or update the env/token file and restart for Docker/systemd-managed
  tokens
- keep ZenNotes updated

## Related docs

- [Security Reference](../reference/security-reference.md)
- [Security Model](../explanation/security-model.md)
- [Self-Host with Docker](./self-host-with-docker.md)
- [At-Rest Encryption](./at-rest-encryption.md)
