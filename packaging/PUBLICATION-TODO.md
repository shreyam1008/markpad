# Publication execution checklist

Updated: 2026-09-12. Existing logo and compatibility identifiers stay unchanged.

## Current release: 0.13.8

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
