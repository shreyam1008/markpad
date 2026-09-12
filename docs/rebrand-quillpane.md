# Quillpane migration from Markpad

Status: Quillpane selected; display migration complete; v0.13.4 is the current
source release and store publication remains pending
Audit date: 2026-09-06
Legal status: naming decision by the maintainer; not trademark, domain, or store-namespace clearance

## Decision

The public product name is now **Quillpane**. Use the positioning:

> **Quillpane — a tiny native Markdown notepad for local files**

The name explains the writing surface without adding another generic
Markdown Notes or SomethingPad label. Quill carries the writing association
and pane matches the focused editor/preview surface.

The exact compound had no direct result in the preliminary public screen on
2026-09-06. The quill root still has adjacent writing/editor products and
extensions, so the name must be rechecked across every target registry and
market before reservation or submission. This document records the chosen
direction; it does not claim legal clearance or ownership.

The existing Markpad logo is intentionally unchanged. The current markpad
SVG, ICO, ICNS, Windows resources, screenshots, and icon filenames remain the
controlled visual asset set. A future logo decision is separate from this
name migration and is maintainer-controlled.

## Why the public name changes

The old Markpad name is same-category and actively crowded:

- markpad.dev markets an active cross-platform Markdown editor.
- github.com/alecdotdev/Markpad ships another desktop editor in the same
  category.
- The exact markpad Snap name is already published by another publisher.
- A MarkPad VS Code editor listing and an exact npm package add more discovery
  ambiguity.
- The common .com, .dev, and .app names were already registered in the earlier
  screen.

Keeping Markpad as the public discovery name would make search, package
discovery, support, and future editor-extension work unnecessarily ambiguous.
The old name remains in technical identifiers so existing installs continue
to work.

## Candidate history

The earlier screen remains useful historical evidence:

| Candidate | Result | Reason |
|---|---|---|
| Quillpane | **Selected** | Best fit for the focused writing surface; exact compound was clear in the preliminary screen, subject to same-day recheck. |
| Draftpane | Not selected | Clear product meaning, but “draft” makes the finished tool sound temporary. |
| Bractnote | Not selected | Distinctive, but unfamiliar pronunciation creates recall friction. |
| Quillpad | Dropped | An active Markdown-notes product already uses the exact name across public code and mobile distribution. |
| ZenNotes | Reference only | An active local-first Markdown notes product already occupies the positioning. |
| Barequill | Dropped | Too close to the broader QUILL/editor adjacency without a compensating meaning. |
| Mardlet | Backup only | More distinctive, but does not explain the product. |

An empty search or an RDAP 404 is only a point-in-time signal. Recheck the
approved spelling immediately before reserving an account, domain, package
namespace, or store listing.

## Public copy

Use **Quillpane** in the title, H1, app window, About panel, installer display
name, desktop entry, AppStream name, package display metadata, release notes,
and portfolio pages. Where migration context matters, write **“Quillpane
(formerly Markpad)”** once.

Keep the supporting language natural:

- tiny native Markdown notepad;
- local Markdown editor;
- plain-file writing;
- local files, offline, no account, no Electron.

Do not stuff the product name with category keywords.

## Compatibility contract

These are durable identifiers. The display-name change must not mutate them
in the compatibility release:

| Surface | Preserved value | Why |
|---|---|---|
| Config root | markpad | Owns session.json, drafts, history, recents, favorites, and preferences. |
| Browser storage | markpad-sections, markpad-ui-zoom, markpad-text-zoom, markpad-zoom | Preserves interface state and the existing zoom-key migration. |
| CLI and binary | markpad | Existing scripts, launchers, file associations, and PATH entries keep working. |
| Go module | markpad | Avoids a repository-wide import migration before any repository move. |
| Single-instance ID | c7b3e4a1-9f2d-4e8b-a6c1-markpad-single | New and old builds continue to share one application instance. |
| macOS bundle ID | io.github.markpad | Preserves upgrade/application identity during the compatibility window. |
| WinGet ID | ShreyamAdhikari.Markpad | Package IDs are identifiers, not display strings. |
| Linux/AppStream IDs | Existing markpad IDs | Avoids parallel installs and broken desktop upgrades. |
| Repository and release URLs | shreyam1008/markpad | Existing installers, links, and release artifacts remain resolvable. |
| Public website | https://quillpane.shreyam1008.com.np/ | Verified custom domain is canonical; the old GitHub Pages address redirects here. |
| Logo and icon filenames | Existing markpad assets | The maintainer has frozen the current logo for this migration. |

The CSS custom-property prefix and internal Go/TypeScript type names may remain
markpad; changing them has no user value and increases migration risk.

## Staged transfer

### Phase 0 — display migration (complete)

- Centralize Quillpane as the public display name in Go and TypeScript.
- Keep the Markpad logo and all generated icon resources unchanged.
- Keep the Markpad repository, binary, URLs, storage root, bundle IDs, and
  package IDs stable.
- Update visible packaging metadata and portfolio copy.
- Keep old welcome drafts and technical data compatible.

Rollback is one display constant change; no user data needs to move.

### Phase 1 — reservation and release gate (mostly complete)

1. Re-run exact-name and similarity searches for Quillpane across GitHub,
   product domains, Snap, Flathub, WinGet, Scoop, Homebrew, Open VSX, the
   Visual Studio Marketplace, and intended trademark classes.
2. Reserve the required accounts and namespaces only after that same-day check.
3. **Complete:** The Cloudflare CNAME and GitHub Pages custom-domain setting for
   quillpane.shreyam1008.com.np are configured and verified. The certificate
   is usable, HTTPS is enforced, the old GitHub Pages URL redirects to the new
   host, and the deployed page now owns the new canonical/OG/schema URLs.
4. **Complete:** Build a fresh compatibility release from the current source;
   `v0.13.3` passed the Linux, Windows, and macOS release workflow, and the
   Windows hash is recorded in the package manifests.
5. **Complete:** Keep the current logo assets unchanged; no icon generation was
   part of the name release.

### Phase 2 — co-branded compatibility release (complete in v0.13.3)

- Ship **Quillpane (formerly Markpad)** in visible display copy.
- Continue producing the markpad executable and accepting all old data paths.
- Keep the old website, repository, release, install, and package URLs alive.
- Publish a migration notice that explicitly says notes, drafts, history, and
  settings remain in place.
- Keep old install commands working for at least two stable releases.
- WinGet PR #430348 is open with the updated display metadata; the personal
  Scoop bucket is live after PR #7 passed install/upgrade/uninstall CI.
  The reproducible `quillpane_0.13.4_amd64.snap` is attached to the v0.13.4
  GitHub release by [workflow 34676727667](https://github.com/shreyam1008/markpad/actions/runs/34676727667).
  Snap Store publication still needs the authenticated `quillpane` namespace.

### Phase 3 — optional namespace transition

- Rename the repository only after clone, release, raw-file, and issue
  redirects are verified.
- If a quillpane executable is ever introduced, keep markpad as a
  compatibility launcher or alias for at least two stable releases.
- Treat new store/package IDs as separate migration projects. Verify upgrade
  and uninstall ownership; never let a new installer remove the old data root.
- Keep reading the markpad config root. Any future data-root migration must
  be copy-first, atomic, idempotent, recoverable, and fixture-tested.

## Store and domain gate

The custom domain is live and verified. Store accounts, namespace reservation,
signing, certification, and the final store submit/publish actions remain
owner-controlled; prepared manifests are still not public listings.

The first useful lanes are:

1. GitHub release and legacy GitHub Pages URL;
2. Scoop with the Quillpane display name (live in the personal bucket);
3. WinGet with the existing package ID/path and Quillpane display name (PR
   pending review);
4. Snap under a separately checked quillpane namespace;
5. Flatpak/Flathub with the existing reverse-DNS identity after the offline
   build is complete;
6. Microsoft Store after a signed Windows installer and Partner Center
   identity are ready.

Never call a prepared manifest live until an anonymous public check records
the exact listing URL and verification date.

## Verification gates before publication

- Upgrade from an actual Markpad data fixture with drafts, a saved file,
  favorites, recents, view/scroll state, and history snapshots.
- Confirm the new display name appears while all preserved identifiers remain
  byte-for-byte compatible.
- Confirm a failed migration leaves the complete old tree untouched and still
  loadable by the previous build.
- Confirm installer upgrade and uninstall behavior separately on Linux,
  Windows, and macOS.
- Confirm old repository, release, raw installer, website, and documentation
  URLs remain usable or redirect correctly.
- Recheck every package and domain namespace immediately before publication.

## Evidence endpoints

- Current collision: markpad.dev,
  github.com/alecdotdev/Markpad,
  snapcraft.io/markpad,
  winstall.app/apps/alecdotdev.Markpad,
  registry.npmjs.org/markpad
- Candidate references:
  github.com/quillpad/quillpad,
  f-droid.org/packages/io.github.quillpad/,
  zennotes.org/
- Distribution: Snap publishing documentation, Flathub submission
  documentation, Microsoft Store Win32 distribution documentation, WinGet,
  Scoop, Open VSX, and the Visual Studio Marketplace.

The request/response matrix is discovery evidence, not ownership or legal
clearance.
