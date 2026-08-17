# Markpad to Quillpane migration record

Status: reversible display-name preview  
Audit date: 2026-08-17  
Legal status: naming discovery only; this is not trademark or legal clearance

## Decision

Use **Quillpane** as the working successor name for the next migration slice. The name describes the product's writing surface and split-pane workflow, is pronounceable, and keeps distance from the crowded `mark*` Markdown-editor category.

The name is not yet treated as an owned namespace. Do not publish packages, rename the repository, buy or redirect domains, or replace durable application identifiers until the maintainer has reserved the required accounts and completed an appropriate legal review.

## Why Markpad must move

The collision is same-category and active, not merely a similar word:

- `https://markpad.dev/` markets an actively maintained cross-platform Markdown editor as "The Notepad equivalent for Markdown."
- `https://github.com/alecdotdev/Markpad` ships the same desktop-editor category and has hundreds of public GitHub stars, releases, and contributors.
- The competing product uses the exact `markpad` Snap name and a WinGet identity. The npm registry also contains an unrelated exact `markpad` package.
- `https://marketplace.visualstudio.com/items?itemName=Ship-lab.markpad` uses MarkPad for a VS Code Markdown editor.
- `markpad.com`, `markpad.dev`, and `markpad.app` all returned registered RDAP records on the audit date.

Keeping Markpad as the public name would make search, package discovery, support, and future editor-extension work needlessly ambiguous.

## Candidate screen

The initial screen checked exact-name general search, GitHub repository names, npm, PyPI, crates.io, Homebrew formulae and casks, Scoop, WinGet, Snapcraft, Flathub, Open VSX, VS Code Marketplace, and common domains where the public interfaces allowed it.

| Rank | Candidate | Result on 2026-08-17 | Reasoning |
|---|---|---|---|
| 1 | Quillpane | No exact GitHub-name, npm, PyPI, crates.io, Homebrew, WinGet, Open VSX, or VS Code Marketplace hit. `.com`, `.dev`, and `.app` returned RDAP 404 at check time. | Best product fit: writing plus a split/local pane, clear spelling, no `mark*` collision. |
| 2 | Draftpane | Same registry screen was clear. | Strong product fit, but "draft" can imply unfinished work and is less ownable in prose. |
| 3 | Barequill | Same registry screen was clear. | Communicates minimal writing, but "quill" can sound literary rather than technical. |
| 4 | Bractnote | Same registry screen was clear. | Distinctive, but pronunciation and meaning require explanation. |
| 5 | Mardlet | Registry screen was mostly clear. | Distinctive but does not explain the product and has weaker recall. |

An RDAP 404 or empty search result is evidence that no record was returned at that moment, not a promise that a domain, package name, or trademark is available. Recheck immediately before every reservation.

## Compatibility contract

These are durable identifiers. A display-name change must not mutate them in the first release:

| Surface | Preserved value | Why |
|---|---|---|
| Config root | `markpad` | Owns `session.json`, drafts, history, recents, favorites, and preferences. |
| Browser storage | `markpad-sections`, `markpad-ui-zoom`, `markpad-text-zoom`, `markpad-zoom` | Preserves interface state and the existing zoom-key migration. |
| CLI and binary | `markpad` | Existing scripts, launchers, file associations, and PATH entries keep working. |
| Go module | `markpad` | Avoids a repository-wide import migration before the repo URL changes. |
| Single-instance ID | `c7b3e4a1-9f2d-4e8b-a6c1-markpad-single` | New and old builds continue to share one application instance. |
| macOS bundle ID | `io.github.markpad` | Preserves upgrade/application identity during the preview. |
| WinGet ID | `ShreyamAdhikari.Markpad` | Published package identifiers are not ordinary display strings. |
| Linux/AppStream IDs | Existing `markpad` IDs | Avoids parallel installs and broken desktop upgrades. |
| Repository and release URLs | `shreyam1008/markpad` | Old installers and release artifacts remain resolvable. |

The CSS custom-property prefix is internal and may remain `--markpad-*` indefinitely; changing it creates risk without user value.

## Staged transfer

### Phase 0 — reversible seam (this branch)

- Centralize public display copy and legacy compatibility constants in Go and TypeScript.
- Show Quillpane in the application/window title, startup fallback, help, About, and new default-draft copy.
- Recognize both Markpad and Quillpane untouched welcome drafts so quitting never invents a dirty-content prompt.
- Lock legacy filesystem, browser-storage, CLI, URL, and single-instance values with tests.
- Keep packaging, repository, install commands, release files, and public redirects unchanged.

Rollback is one display constant change; no user data needs to move.

### Phase 1 — reserve and validate

1. Re-run exact-name searches and obtain legal/trademark advice appropriate to the intended markets.
2. Reserve the GitHub repository name, package-manager namespaces, and relevant domains before announcing the name.
3. Create `quillpane.shreyam1008.com.np` as the canonical product page; keep the old GitHub Pages URL live.
4. Update the existing vector icon from `M` to `Q` only after the name is reserved. Do not generate a bitmap-only master.
5. Test a real v0.9.2 upgrade fixture on Linux, Windows, and macOS before modifying installers.

### Phase 2 — co-branded compatibility release

- Ship **Quillpane (formerly Markpad)** as display copy under the existing package identities.
- Continue producing the `markpad` executable and accepting all old data paths.
- Add the new website and source URLs only after redirects are verified from a clean browser.
- Publish a migration notice that explicitly says no notes, drafts, or history move.
- Keep old install commands working for at least two stable releases.

### Phase 3 — namespace transition

- Rename the GitHub repository only after confirming GitHub redirects for clone, release, raw-file, and issue URLs.
- If a new `quillpane` executable is added, ship `markpad` as a compatibility launcher or alias for at least two stable releases.
- Treat new store/package IDs as separate migration projects. Verify upgrade behavior and uninstall ownership; never let a new installer remove the old data root.
- Keep reading the `markpad` config root. A future data-root migration must be copy-first, atomic, idempotent, recoverable, and covered by real fixture tests.

## Verification gates before any release

- Upgrade from an actual v0.9.2 data fixture with multiple drafts, a saved file, favorites, recents, per-document view/scroll state, and history snapshots.
- Confirm both old and new launch commands open the same single instance when an alias is introduced.
- Confirm a failed migration leaves the complete old tree untouched and still loadable by v0.9.2.
- Confirm installer upgrade/uninstall behavior separately on Linux, Windows, and macOS.
- Confirm old repository, release, raw installer, website, and documentation URLs redirect correctly.
- Recheck every package/domain namespace immediately before publication.

## Evidence endpoints

- Current collision: `https://markpad.dev/`, `https://github.com/alecdotdev/Markpad`, `https://snapcraft.io/markpad`, `https://winstall.app/apps/alecdotdev.Markpad`, `https://registry.npmjs.org/markpad`
- Candidate packages: `https://registry.npmjs.org/<name>`, `https://pypi.org/pypi/<name>/json`, `https://crates.io/api/v1/crates/<name>`
- Distribution: `https://formulae.brew.sh/api/formula/<name>.json`, `https://formulae.brew.sh/api/cask/<name>.json`, `https://api.winget.run/v2/packages`, `https://open-vsx.org/api/-/search`, the Visual Studio Marketplace gallery API, Snapcraft, and Flathub search
- Domains: Verisign `.com` RDAP and Google Registry `.dev`/`.app` RDAP

The exact request/response matrix was gathered as discovery evidence, not as ownership or legal clearance.
