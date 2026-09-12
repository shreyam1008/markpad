# Publication execution checklist

Updated: 2026-09-12. Existing logo and compatibility identifiers stay unchanged.

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

The Pages workflow now assembles signed APT metadata from the checksum-pinned
v0.13.3 Debian artifact on every deployment, so docs updates preserve the lane.
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
