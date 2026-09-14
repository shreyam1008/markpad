# Quillpane packaging guide

Publisher: Shreyam Adhikari (`shreyam1008@gmail.com`)

Release target: v0.14.2

Current execution state and human gates: [publication checklist](PUBLICATION-TODO.md).

## GitHub release first

After local checks, push `main` and only the annotated release tag atomically: `git push --atomic origin main v0.14.2`. `.github/workflows/release.yml` builds:

- `markpad`, `markpad_0.14.2_amd64.deb`, and `Markpad.AppImage` for Linux. These legacy artifact names remain stable while the app displays as Quillpane.
- `markpad-setup.exe` for Windows, with the unchanged Markpad ICO embedded into both application and installer.
- `Markpad.dmg` and `Markpad-macOS.zip`, with the unchanged Markpad ICNS in the app bundle.

Verify all artifacts before submitting to a store. Do not publish a Scoop, WinGet, or Flatpak manifest with a placeholder hash or commit ID.

## Product icon contract

`packaging/linux/markpad.svg` and its generated companions are the frozen Quillpane product mark for this migration. Do not change or regenerate the logo assets as part of the name migration; the maintainer controls a future logo update separately.

## Snap Store

`snap/snapcraft.yaml` derives its version from `main.go` and builds the frozen Bun frontend before Go. The repository
also has a `Build Snap` workflow that produces a downloadable `.snap` artifact
from a selected immutable ref. Build and inspect locally when Linux tooling is
available:

```sh
sudo snap install snapcraft --classic
snapcraft
snap install --dangerous ./quillpane_0.14.2_amd64.snap
```

The release workflow checks the Snap version and publishes its SHA256 alongside
all other platform artifacts. The compiler is the official Go 1.27.1 Linux
archive, pinned by its published SHA256, because the Go Snap channel lags upstream.

The public candidate channel was verified at 0.13.4, revision 1, on 13 September.
The GitHub publishing secret is not configured. Once owner credentials are ready,
run `Publish verified Snap artifact` with `v0.14.2`, test candidate installation
and upgrade on Linux, then promote the tested revision to stable. Do not treat
an attached GitHub Snap as a Store update.

## Signed APT

Pages now generates a signed repository from the checksum-pinned stable `.deb`
and tests installation/removal before deployment. A second check verifies the
anonymous HTTPS repository after deployment. Package name remains `markpad`.
See [the checklist](PUBLICATION-TODO.md#apt-signed-repository-live)
for verification status and signing-key recovery/rotation responsibilities.

```sh
curl -fsSLo /tmp/quillpane-key.asc https://quillpane.shreyam1008.com.np/apt/key.asc
gpg --show-keys --with-fingerprint /tmp/quillpane-key.asc
# Verify: 35B80DDD8D3781FD3781FE188EEFA506FAF81409
sudo install -m 644 /tmp/quillpane-key.asc /usr/share/keyrings/quillpane.asc
echo 'deb [signed-by=/usr/share/keyrings/quillpane.asc] https://quillpane.shreyam1008.com.np/apt stable main' | sudo tee /etc/apt/sources.list.d/quillpane.list
sudo apt-get update
sudo apt-get install markpad
```

## Flatpak

The separate `publication/flatpak-portal-20260912` preparation branch is not a
published Flathub release. Its portal acceptance and human-authored submission
gates remain separate from this app release. Refresh its pinned source and
offline dependencies to the release only after that work is reconciled.

## WinGet

The `0.14.2` manifest directory uses the published installer and verified SHA256.
Local `winget validate` passes. Existing [PR #430348](https://github.com/microsoft/winget-pkgs/pull/430348)
was updated instead of creating a duplicate. `ShreyamAdhikari.Markpad` remains the
compatibility ID and Quillpane the display name. Upstream review is pending;
this is not yet a default-source availability claim. Historical local manifests
remain unchanged.

## Scoop

The local template and personal bucket serve `0.14.2` using the verified release
installer SHA256. The bucket autoupdate test now reads Quillpane's manifest version
instead of forcing an obsolete version. This is a personal-bucket channel, not
the default Scoop bucket.

```powershell
scoop bucket add shreyam https://github.com/shreyam1008/scoop-bucket
scoop install shreyam/quillpane
```

## Final checklist

- Local frontend/Go checks, 120 native Windows task checks and visual captures passed.
- Release jobs must pass platform tests, Linux native smoke and package version checks.
- Verify package checksums and the signed APT installation result after publication.
- Preserve the original ICO/ICNS/SVG, compatibility IDs and user data.
- Record live, submitted and blocked versions separately in the publication checklist.
- Store validation is separate from installed-package functional testing and review.
