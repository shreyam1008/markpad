# Publication execution checklist

Updated: 2026-09-06. Existing logo and compatibility identifiers stay unchanged.

## Snap: registered and built, not published

- [x] Register `quillpane` in the owner's global Snap Store account.
- [x] Build v0.13.3 and attach the snap to the GitHub release.
- [x] Prepare `Publish verified Snap artifact` workflow with pinned checksum.
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

## APT: deployment and verification in progress

The Pages workflow now assembles signed APT metadata from the checksum-pinned
v0.13.3 Debian artifact on every deployment, so docs updates preserve the lane.
Package name remains `markpad`; only the public brand is Quillpane.

Signing fingerprint: `35B80DDD8D3781FD3781FE188EEFA506FAF81409`.
Key created 2026-09-06, expires in two years. Actions uses the private-key secret
`APT_SIGNING_PRIVATE_KEY` and fingerprint variable `APT_SIGNING_KEY_ID`.
Owner recovery material is outside Git at
`C:\Users\shreyam\.codex\distribution-signing\quillpane` with restricted ACLs.
Back up securely and rotate before expiry; never publish that directory.

- [ ] Pages workflow authenticated APT install/removal test passes.
- [ ] Verify public `/apt/key.asc` and `/apt/dists/stable/InRelease`.
- [ ] Verify anonymous HTTPS APT install, launch, upgrade, uninstall.
- [ ] Only then mark APT live in the portfolio control plane.

## Flathub: not ready for a submission yet

- [ ] Resolve the unpublished Flatpak ID: `io.github.markpad` lacks the required
  GitHub owner component. Candidate: `io.github.shreyam1008.markpad`, matching
  the repository. Keep existing non-Flatpak compatibility IDs unchanged.
- [ ] Align desktop filename, icon reference, and metainfo with that Flatpak ID.
- [ ] Select a supported GNOME runtime and verify the WebKitGTK ABI.
- [ ] Supply source-pinned offline Bun/npm and Go dependencies; build frontend
  before Go embeds it. Verify with networking disabled during compilation.
- [ ] Reduce filesystem permissions to what actual open/save behavior needs.
- [ ] Run flatpak-builder, AppStream validation, lints, and desktop smoke tests.
- [ ] Human reviews included AI-generated material and its approximate extent.
- [ ] **Human authors and opens the Flathub PR, including its commit message,
  description and replies. Do not ask an AI agent to write those interactions.**

Policy: https://docs.flathub.org/docs/for-app-authors/requirements#generative-ai-policy

## Microsoft Store

- [x] Sign in and reach individual developer onboarding.
- [ ] Owner completes live government-ID photo/selfie verification.
- [ ] Owner supplies accurate profile details and completes enrollment.
- [ ] Reserve app identity, choose supported Windows package/signing route,
  finish listing metadata, submit for certification, verify public listing.

Account login is not completed Store enrollment or app publication.
