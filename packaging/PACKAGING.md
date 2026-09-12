# Quillpane packaging guide

Publisher: Shreyam Adhikari (`shreyam1008@gmail.com`)

Release target: v0.13.4

Current execution state and human gates: [publication checklist](PUBLICATION-TODO.md).

## GitHub release first

Push `main`, wait for CI, then push only the annotated release tag. `.github/workflows/release.yml` builds:

- `markpad`, `markpad_0.13.4_amd64.deb`, and `Markpad.AppImage` for Linux. These legacy artifact names remain stable while the app displays as Quillpane.
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
snap install --dangerous ./quillpane_0.13.4_amd64.snap
```

The v0.13.4 workflow run [34676727667](https://github.com/shreyam1008/markpad/actions/runs/34676727667)
attached `quillpane_0.13.4_amd64.snap` and its CI-generated SHA-256 to the
matching GitHub release. Verify the asset and checksum before smoke testing the
candidate.

After smoke testing:

```sh
snapcraft login
snapcraft upload quillpane_0.13.4_amd64.snap --release=stable
```

The `Publish verified Snap artifact` workflow can upload this exact artifact to
candidate once `SNAPCRAFT_STORE_CREDENTIALS` is configured. Test candidate before
stable promotion. The name is registered, but no store release is claimed yet.

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

The manifest is pinned to the `v0.13.4` source commit and the offline Bun/Go
sources are present. Run the manual Flatpak workflow on Linux before submitting
to Flathub; the public listing remains pending review.

## WinGet

The `v0.13.3` compatibility installer exists at the public release URL. The new manifest directory keeps `ShreyamAdhikari.Markpad` as the compatibility package ID, uses `Quillpane` as the display name, and passes local `winget validate`. Never edit a historical version directory in place. The public WinGet PR still waits on the signing/maintainer review gate.

## Scoop

The repository template now uses version `0.13.3`, the exact release URL, and the real SHA-256. The Quillpane manifest is live in the personal bucket after PR #7 passed install/upgrade/uninstall CI. It is a personal-bucket channel, not a claim that Quillpane is in the default Scoop bucket.

```powershell
scoop bucket add shreyam https://github.com/shreyam1008/scoop-bucket
scoop install shreyam/quillpane
```

## Final checklist

- `make setup`, `make check`, and `git diff --check` passed in the release workflow before tagging.
- Version and 2026-09-06 release date are synchronized in source and non-hash packaging metadata.
- The GitHub release workflow passed for Linux, Windows, and macOS at `v0.13.3`; the generated installer artifacts are not code-signed yet.
- AppStream metadata validates.
- Windows application and NSIS installer show the expected ICO.
- macOS bundle contains `Contents/Resources/markpad.icns` and its plist references it.
- GitHub artifacts launch and complete the folder/search/delete smoke flow.
- Store manifests contain real hashes/commit IDs generated from the published release.
