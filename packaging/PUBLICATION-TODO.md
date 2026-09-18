# Publication execution checklist

Updated: 2026-09-18. Existing logo and compatibility identifiers stay unchanged.

## GitHub-only patch: 0.14.4

The owner requested the GitHub commit and release first; store and other
distribution submissions are intentionally deferred. `github-only-releases.txt`
records the exception, so the website/APT workflow will not publish this tag.
The release workflow may build matching platform artifacts, but no Store, Snap,
Scoop, WinGet, Flathub, website, or APT submission is claimed here.

Changes: external-file change warnings with draft-preserving reload History,
verified Windows/Linux update handoff after a clean save, and the associated
performance and recovery checks. Release validation is recorded by the GitHub
tag workflow; do not report publication before its publish job completes.

## GitHub-only patch: 0.14.3

The owner explicitly requested this patch on GitHub only. Microsoft Store and all
other distribution updates are held for a larger change. This overrides the normal
all-store follow-through for this version. `github-only-releases.txt` records the
exception; the website/APT workflow checks it before deployment. Building platform
artifacts does not submit them to stores. Do not update Scoop/WinGet manifests,
create another Store submission, or change the existing 0.14.2 submission.

Changes: inline task filtering with highlighted card matches, compact All/Open/Done
pills and no search sidebar. Browser UI checks, 93 frontend tests, both frontend
builds and Go checks passed for the feature. Manual Windows keyboard/native checks
remain unverified as documented in PR #14. Release validation is recorded in the
GitHub tag workflow; do not report publication before its publish job completes.

## Previous full distribution release: 0.14.2

Source `28334ce5a04b5ee86e257e7e7aae1adfc3be094e`, immutable tag `v0.14.2`.
The owner resumed publication on 14 September after the remote Windows drag test
remained inconclusive. Native collapsed headings and keyboard column reordering
passed; manual Windows card/column dragging and save/reopen remain unverified.
See [patch verification](../docs/task-hotfix-0.14.2.md).

| Channel | Verified state on 14 September 2026 |
|---|---|
| GitHub | **0.14.2 published**, all ten assets; [release](https://github.com/shreyam1008/markpad/releases/tag/v0.14.2) |
| Website / signed APT | **0.14.2 published**; public schema and package hash match; anonymous HTTPS APT install/removal passed |
| Microsoft Store | **0.14.2.0 submitted**, Submission 4 `1152921505701883603`, Partner Center shows **In certification**; auto-publish enabled. Public version remains 0.14.1.0 until approval |
| Scoop personal bucket | **0.14.2 published**, verified installer hash; commit `7ee86486a719146a6843c07283d415f82ef2e796` |
| WinGet | Existing [PR #430348](https://github.com/microsoft/winget-pkgs/pull/430348) updated to **0.14.2**, head `1ed743602b003764ce89776fc2221ce45fa73291`; upstream checks/review tracked on that head; not in default source yet |
| Snap Store | **0.13.4 candidate, revision 1**; 0.14.2 artifact built, publishing blocked on owner credentials |
| Flathub | **Not published**; portal file-open acceptance and human audit/submission remain required |
| AlternativeTo | Existing notes-first/task feature/screenshots suggestions and Go + TypeScript correction remain under moderation; no duplicate submission |

[Release workflow 34804710420](https://github.com/shreyam1008/markpad/actions/runs/34804710420)
passed every platform, publication and signed APT/site job after resuming the
cancelled jobs. Windows/MSIX/Debian downloads match GitHub asset digests; the Snap
checksum receipt matches its published asset digest. MSIX identity, architecture,
version and publisher were checked before upload; Partner Center validated it.
Updated release notes were saved, and the existing screenshots and listing retained.

Verified 0.14.2 SHA256 values:
- Windows installer: `9e9a036a83249704edb818b1b20044db519945884363649e0bb2605a0f27f0a9`
- MSIX: `adec603267b8df3f673ac70ce6b2e40ecef676f4f863d85341b09bf6bc21a7e0`
- Debian: `dbce8102bfb252d34badc4324f1d25d1cdec005d4db372eecf40b25a908aa3ac`
- Snap: `f9e119c375b6955b2d4dad3d4517c1fe84230847393757aa09b661e6ce807f40`

Next actions: await Microsoft certification and WinGet moderation; configure
`SNAPCRAFT_STORE_CREDENTIALS` through the owner's separate setup, then dispatch
`Publish verified Snap artifact` for **v0.14.2**, test candidate install/upgrade
before promoting stable. Reconcile the separate Flatpak portal branch and refresh
its source pins only after acceptance passes. Never use the historical versions below
as the next publication target.

## Previous release: 0.14.1

The 0.14.0 tag was not published: Snap could not install the unavailable Go 1.27
Snap channel. 0.14.1 pins the official Go 1.27.1 archive and its published SHA256;
application behavior is unchanged from the 120-check visual candidate.

| Channel | Verified state on 14 September 2026 |
|---|---|
| GitHub | **0.14.1 published**, source `a00635d42d6292829df9d528ffa5221173f56da3`; all ten assets present |
| Website / signed APT | **0.14.1 published**; anonymous website schema and APT version/hash verified; signed HTTPS installation/removal passed |
| Microsoft Store | **0.14.1.0 live**, Submission 3 `1152921505701880695`; Partner Center confirms the latest product is available |
| Scoop personal bucket | **0.14.1 published** with the verified installer URL/hash; commit `34fa290b4b33aafd5fcaf13e615c94b12fddcf75` |
| WinGet | Existing **PR #430348 updated to 0.14.1**, all ten upstream package validations and CLA pass; moderator review/merge pending; not in the default source yet |
| Snap Store | **0.13.4 candidate, revision 1** confirmed through the public Snap API; 0.14.1 update blocked on owner publishing credentials |
| Flathub | **Not published**; separate portal acceptance and human-authored submission gates remain |
| AlternativeTo | Public listing; corrected 0.14.1 copy, Microsoft Store link, task features and four current screenshots submitted for moderation on 14 September |
| Portfolio distribution tracker | Reconciled in the [14 September checkpoint](https://github.com/shreyam1008/buggy/blob/master/docs/projects/quillpane-publication-2026-09-14.md) |

Evidence:
- [GitHub release](https://github.com/shreyam1008/markpad/releases/tag/v0.14.1)
- [Complete release workflow](https://github.com/shreyam1008/markpad/actions/runs/34766846468)
- [Passing CI](https://github.com/shreyam1008/markpad/actions/runs/34766846558)
- [Partner Center](https://partner.microsoft.com/en-us/dashboard/products/9MZDJLQ6V8L3/overview)
- [Scoop manifest](https://github.com/shreyam1008/scoop-bucket/blob/main/bucket/quillpane.json)
- [WinGet PR](https://github.com/microsoft/winget-pkgs/pull/430348), head `56eea7aa358aeddf7fb570f3c57f00f4a5c22b61`
- [Portfolio tracker](https://shreyam1008.com.np/projects/#distribution-markpad)

Verified SHA256 values:
- Windows installer: `5b4dbf396a2af7a7ed1e42b138a685f45a76e2085e31619a399a95e4500108c0`
- MSIX: `13ac7c787e9aef2ef104bf24badc0141a2db212a4749ab4db49374de3fb378c3`
- Debian: `6f694598e00deb2bcb34209db5a6882a278e8bf35298226d5bbe14a9a73bd779`
- Snap: `4615005fa606c98dea278bd5535a69ede0c44a4cf7c7669d8315ff7aa572f96a`

The MSIX embedded version, architecture and publisher were checked before upload;
Partner Center validated the package. Description, features, release notes and
reviewer instructions now cover tasks and individual files. Four fresh Windows
screenshots show notes and Split first, followed by the optional board and calendar.
The logo, pricing, ratings and availability are preserved. Publishing after certification
is enabled. Installed-MSIX functional testing remains separate.

Scoop's first CI run failed because its autoupdate check forced the obsolete 0.13.3
version. Commit `a6e3e6a` reads Quillpane's manifest version for that check; see
[passing verification run](https://github.com/shreyam1008/scoop-bucket/actions/runs/34767431699), including install, update, uninstall and autoupdate checks.
No ProtoPeek application or package manifest was changed.

Snap's `SNAPCRAFT_STORE_CREDENTIALS` remains absent from GitHub secrets. The signed-in
dashboard's upload page only supplies CLI instructions; there is no browser artifact
uploader. Public API still reports only 0.13.4 candidate revision 1 on 14 September. Once the
owner's separate setup is ready, dispatch `Publish verified Snap artifact` with
`v0.14.1`, test candidate install/upgrade on Linux and promote the tested revision.
Do not publish superseded versions from historical instructions below. The separate
`publication/flatpak-portal-20260912` branch must be reconciled and its source pins
refreshed before Flathub submission; it is not a live release channel.

Local checks: 120 native Windows task checks, 93 frontend tests, Go tests/vet and
both frontend builds. Release jobs also passed native Linux smoke and all platform
package checks. See [feature and visual verification](../docs/tasks-release-design-2026-09.md).

The September 13 presentation refresh keeps notes as the main product: new native
screenshots, a keyboard-accessible [screenshot tour](https://quillpane.shreyam1008.com.np/#screenshots),
a [two-minute demo](../docs/demo.md), public sample files, README/release copy and
discovery metadata. Portfolio commit `059834f` carries the same notes-first image
and roadmap. [Infinite canvas board #13](https://github.com/shreyam1008/markpad/issues/13)
is the next planned feature, not part of 0.14.1. This documentation/listing refresh
does not change the release artifacts or require an application version bump.

## Previous release: 0.13.8

The 0.13.7 candidate was not published: native screenshot OCR misread the tour button. Its release run was cancelled. 0.13.8 corrects test targeting without changing tour behavior.

- **GitHub: published.** [v0.13.8](https://github.com/shreyam1008/markpad/releases/tag/v0.13.8), source `1b448bd`, contains matching Linux binary/deb/AppImage, Windows EXE/setup/MSIX, macOS DMG/ZIP, and Snap. All package jobs and publication passed in [release run 34687765480](https://github.com/shreyam1008/markpad/actions/runs/34687765480). [CI 34687765674](https://github.com/shreyam1008/markpad/actions/runs/34687765674) passed, including native Linux Help, tour, and clipboard smoke checks. Help now places version/update information first, followed by tour/shortcuts and local data/project/creator links.
- **Website and signed APT: published 0.13.8.** Anonymous public website schema and APT Packages metadata verified on 12 September. The release workflow passed its anonymous HTTPS signed APT installation check. Debian SHA256 matches the GitHub release: `f4d66716fef2dd881d7519a41b7168dad3ea21a65c70c0ed167ef09d2f2ba7b3`.
- **Microsoft Store: 0.13.8.0 submitted, awaiting certification.** Inspected and replaced the pending 0.13.6 submission, validated the new package, updated release notes, and submitted Submission 2 (`1152921505701875897`). Partner Center shows **In certification**, pre-processing, and automatic publishing after approval. Previously live 0.13.3.0 remains until approval. Uploaded MSIX version and SHA256 match the GitHub release asset: `15c52001aede195f14578530ad9d8f8467ed649828a93f19338619a481d44582`. Installed-MSIX functional testing remains pending. [Dashboard](https://partner.microsoft.com/en-us/dashboard/products/9MZDJLQ6V8L3/overview).
- **Snap Store: blocked on owner credential setup.** GitHub still has only `APT_SIGNING_PRIVATE_KEY`; no Snap publishing credential. Matching 0.13.8 package is published on GitHub, SHA256 `ab8e80cb0782f2d60278657bce9ef563c5e7e0e66ff33eb0556f4f53d9e653ae`. After the owner's separate setup is ready, dispatch `Publish verified Snap artifact` with `v0.13.8`, smoke-test candidate install/upgrade, and promote to stable. Do not publish superseded versions from historical instructions below.
- **Flathub: not published.** Separate preparation and human-authored submission remain pending. No all-stores-live claim.

The original Markpad icon remains unchanged. Existing unsaved notes were not closed to force a local Windows upgrade. Standalone installations can use the 0.13.8 Windows setup; Microsoft Store installations wait for approval and Store delivery.

## Previous release: 0.13.6 (historical status; superseded above)

- **GitHub: published.** [v0.13.6](https://github.com/shreyam1008/markpad/releases/tag/v0.13.6), source `0f7b3df43106ffa53b34d3566af1b2481964e012`, contains matching Linux binary/deb/AppImage, Windows EXE/setup/MSIX, macOS DMG/ZIP, and Snap. [Release run 34686714762](https://github.com/shreyam1008/markpad/actions/runs/34686714762) and [CI 34686714940](https://github.com/shreyam1008/markpad/actions/runs/34686714940) passed. Native Linux clipboard, Help, and Driver.js tour smoke passed; browser QA covered all 16 steps, restart/exit, narrow layout, bidirectional Split sync, and sync-off behavior.
- **Website and signed APT: published 0.13.6.** Anonymous public website schema/download version and Packages metadata verified on 12 September. Public signed APT installation passed in the release workflow. Debian SHA256: `74abbc84f901f029df8f153f34003a21f06ed3b9e920e7f2ae81ac25fe7cec6b`.
- **Microsoft Store: 0.13.6.0 submitted, awaiting certification.** Inspected and cancelled our pending 0.13.5 certification, replaced its package in Submission 2 (`1152921505701875897`), updated the description/features/release notes to remove folder-workspace claims, and submitted again. Partner Center shows **In certification**, pre-processing, with automatic publishing after approval. Previously live 0.13.3.0 remains until approval. Package validation passed. Its embedded version and SHA256 match the published GitHub asset: `30422e550a1bfc50a4d03bca181a4a04ad33c4226ff40e738686d88342417666`. Existing screenshots, original icon, pricing, ratings and availability preserved. Installed-MSIX functional testing remains pending. [Dashboard](https://partner.microsoft.com/en-us/dashboard/products/9MZDJLQ6V8L3/overview).
- **Snap Store: blocked on owner credential setup.** Only `APT_SIGNING_PRIVATE_KEY` is configured in GitHub; no Snap publishing credential as of this release. The owner is configuring Snap on Ubuntu separately. Matching package is available with SHA256 `1ac79fd8d63e6f35fbf539f0342a4462e2d9b9a34e7a1a5c7200fd8f0e79e7df`. Once credentials are ready, dispatch `Publish verified Snap artifact` with `v0.13.6`, smoke-test candidate install/upgrade, then promote to stable. Do not publish the superseded 0.13.5 package.
- **Flathub: not published.** Separate preparation and human-authored submission remain pending. No all-stores-live claim.

The original Markpad icon is preserved. Update the standalone Windows installation with the 0.13.6 setup, then reopen after saving notes. A Linux update does not replace a separate Windows installation.

## Previous release: 0.13.5 (historical status; superseded by the record above)

- **GitHub: published.** [v0.13.5](https://github.com/shreyam1008/markpad/releases/tag/v0.13.5)
  contains matching Linux binary, Debian package, AppImage, Windows EXE/setup,
  MSIX 0.13.5.0, macOS DMG/ZIP, and Snap 0.13.5 plus its checksum.
  [Release run 34684856423](https://github.com/shreyam1008/markpad/actions/runs/34684856423)
  passed all platform checks and signed APT installation verification.
- **Website and signed APT: published 0.13.5.** Anonymous public Packages metadata
  and website download links verified on 12 September. The initial public APT
  check ran before Cloudflare propagation; its rerun passed. Future workflows
  now wait for the requested version before testing installation.
- **Microsoft Store: 0.13.5.0 submitted, awaiting certification.** Used the
  signed-in Partner Center browser because submission API access is not configured.
  Submission `1152921505701875897` (Submission 2) showed **In certification**,
  pre-processing in progress, on 12 September. Automatic publishing after approval
  is enabled. The previously published version remains 0.13.3.0 until approval.
  Release notes were updated; existing screenshots, original package icon, pricing,
  availability, and ratings were preserved. [Dashboard](https://partner.microsoft.com/en-us/dashboard/products/9MZDJLQ6V8L3/overview).
  Verified uploaded MSIX manifest version and GitHub SHA256:
  `7b36cf2a40fd640e430aff01fc9a492db32633022d29d4c43451bd6684e197e3`.
  Installed-MSIX functional testing remains pending.
- **Snap Store: blocked on owner credential setup, not published.** The owner is
  configuring this on Ubuntu separately; do not interfere. Once configured, run
  `Publish verified Snap artifact` with tag `v0.13.5`, test candidate installation
  and upgrade, then promote the tested revision to stable. The manual workflow no
  longer defaults to an obsolete release tag. GitHub Snap SHA256:
  `448aac9c7b02cb4c51c0d877073da97dd357d754bd59049f356871ff3b121a63`.
- **Flathub: not published.** Separate preparation is in progress; retain the
  human-submission requirement below. No claim of a public Flathub release.

The local standalone Windows installation was verified as 0.13.3 during this
release work. A Linux machine reporting 0.13.4 does not update that separate
Windows installation. Install the 0.13.5 Windows setup to receive visible Help,
About/version, and updates. Do not close unsaved user notes to force an upgrade.

## Snap: registered; build and publish workflow prepared

- [x] Register `quillpane` in the owner's global Snap Store account.
- [x] Run the tag workflow for v0.13.4 and verify the snap plus checksum on the
  [GitHub release](https://github.com/shreyam1008/markpad/releases/tag/v0.13.4)
  ([workflow 34676727667](https://github.com/shreyam1008/markpad/actions/runs/34676727667)).
- [x] Prepare `Publish verified Snap artifact` workflow with release checksum verification.
- [ ] Owner authenticates Snapcraft on a trusted Linux machine and configures a
  snap-scoped `SNAPCRAFT_STORE_CREDENTIALS` GitHub Actions secret. Do not paste
  credentials into a chat or commit them.
- [ ] Run the publish workflow; it uploads to **candidate**, never automatically
  stable. Local Linux is unnecessary for the workflow itself.
- [ ] Install candidate on Linux, verify launch, desktop entry, open/save,
  permissions, upgrade, and uninstall. Check the `quillpane` command against the
  legacy `Exec=markpad` desktop integration before promoting.
- [ ] Promote the tested revision to stable and verify anonymous store listing.

The authenticated dashboard showed zero published snaps on 2026-09-06. The
hosted-build landing page did not expose a repository connection for this
registered-but-unpublished name. Registration is not publication.

## APT: signed repository live

The Pages workflow assembles signed APT metadata from the checksum-pinned
stable Debian release on every deployment, so docs updates preserve the lane.
Package name remains `markpad`; only the public brand is Quillpane.

Signing fingerprint: `35B80DDD8D3781FD3781FE188EEFA506FAF81409`.
Key created 2026-09-06, expires in two years. Actions uses the private-key secret
`APT_SIGNING_PRIVATE_KEY` and fingerprint variable `APT_SIGNING_KEY_ID`.
Owner recovery material is outside Git at
`C:\Users\shreyam\.codex\distribution-signing\quillpane` with restricted ACLs.
Back up securely and rotate before expiry; never publish that directory.

- [x] Pages workflow authenticated APT install/removal test passes.
- [x] Public key and signed repository verified through anonymous HTTPS APT.
- [x] Anonymous HTTPS install/removal passed in [run 34028740165](https://github.com/shreyam1008/markpad/actions/runs/34028740165).
- [ ] Complete desktop GUI launch and upgrade smoke tests.
- [x] Signed APT marked live in the portfolio control plane; no GUI smoke-test claim.

## Flathub: not ready for a submission yet

- [x] Resolve the unpublished Flatpak ID: `io.github.markpad` lacked the required
  GitHub owner component. Candidate: `io.github.shreyam1008.markpad`, matching
  the repository. Keep existing non-Flatpak compatibility IDs unchanged.
- [x] Align desktop filename, icon reference, and metainfo with that Flatpak ID.
- [x] Select a supported GNOME runtime and add a WebKitGTK ABI verification step.
- [x] Supply source-pinned offline Bun/npm and Go dependencies; build frontend
  before Go embeds it. Verify with networking disabled during compilation.
- [x] Reduce filesystem permissions to what actual open/save behavior needs.
- [ ] Run flatpak-builder, AppStream validation, lints, and desktop smoke tests.
- [ ] Human reviews included AI-generated material and its approximate extent.
- [ ] **Human authors and opens the Flathub PR, including its commit message,
  description and replies. Do not ask an AI agent to write those interactions.**

Policy: https://docs.flathub.org/docs/for-app-authors/requirements#generative-ai-policy

## Microsoft Store

- [x] Sign in and reach individual developer onboarding.
- [x] Owner completes live government-ID photo/selfie verification.
- [x] Owner supplies accurate profile details and completes enrollment.
- [x] Reserve Quillpane: product `9MZDJLQ6V8L3`, submission `1152921505701821886`.
- [x] Build MSIX `0.13.3.0` for Windows 11 x64; MakeAppx and Microsoft upload validation passed.
- [x] Save free worldwide public availability and Productivity properties.
- [x] Publish and verify HTTPS privacy notice: https://quillpane.shreyam1008.com.np/privacy.html
- [x] Owner saves IARC declaration; dashboard age ratings Complete (Everyone / 3+).
- [x] Save English description, four features, short description and developer name.
- [x] Enter runFullTrust justification and reviewer functional-test instructions.
- [x] Save runFullTrust justification; Microsoft enabled and accepted certification submission.
- [x] Capture and upload two genuine Windows screenshots with captions, preserving the logo; Store listings Complete.
- [x] Upgrade standalone Windows app to v0.13.3; verify saved demo note, preview and split view. This is not an installed-MSIX test.
- [ ] Test the installed MSIX: launch, open/save, history, recovery, upgrade/removal.
- [x] Submit for certification on 2026-09-06: dashboard shows In certification, pre-processing in progress; automatic publishing after approval.
- [x] Verify anonymous Microsoft Store listing: 9 September 2026, India market, Quillpane by shreyam1008 with Download button, 3+ rating and two screenshots. Public availability verified; installed-MSIX smoke test remains pending.

Dashboard: https://partner.microsoft.com/en-us/dashboard/products/9MZDJLQ6V8L3/overview
Verified public URL (9 September 2026): https://apps.microsoft.com/detail/9MZDJLQ6V8L3
Uploaded screenshots: `dist/store-screenshots/quillpane-preview-store.png` and
`dist/store-screenshots/quillpane-split-store.png` (verified PNG encoding).
Optional trailer, promotional artwork and logo overrides are not uploaded;
the Store uses the existing package logo. Xbox assets are not applicable.

Package source and reproducible build script: `windows/store/`. SHA256 of the uploaded MSIX:
`7f40e2f7097e4b344efee16d05f5df748e67c989657fc27ba1a54e8f5e23f17d`.
Store package validation is not functional testing or certification approval.

Account login is not completed Store enrollment or app publication.
