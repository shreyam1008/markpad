# Quillpane packaging guide

Publisher: Shreyam Adhikari (`shreyam1008@gmail.com`)

Release target: v0.13.3

## GitHub release first

Push `main`, wait for CI, then push only the annotated release tag. `.github/workflows/release.yml` builds:

- `markpad`, `markpad_0.13.3_amd64.deb`, and `Markpad.AppImage` for Linux. These legacy artifact names remain stable while the app displays as Quillpane.
- `markpad-setup.exe` for Windows, with the unchanged Markpad ICO embedded into both application and installer.
- `Markpad.dmg` and `Markpad-macOS.zip`, with the unchanged Markpad ICNS in the app bundle.

Verify all artifacts before submitting to a store. Do not publish a Scoop, WinGet, or Flatpak manifest with a placeholder hash or commit ID.

## Product icon contract

`packaging/linux/markpad.svg` and its generated companions are the frozen Quillpane product mark for this migration. Do not change or regenerate the logo assets as part of the name migration; the maintainer controls a future logo update separately.

## Snap Store

`snap/snapcraft.yaml` builds the frozen Bun frontend before Go. Build and inspect locally:

```sh
sudo snap install snapcraft --classic
snapcraft
snap install --dangerous ./markpad_0.13.3_amd64.snap
```

After smoke testing:

```sh
snapcraft login
snapcraft upload markpad_0.13.3_amd64.snap --release=stable
```

The Snap Store operation is external and is not performed by the GitHub release workflow.

## Flatpak

The manifest is pinned to the published `v0.13.3` source commit, but it is not Flathub-ready yet. The remaining release work is to provide the frontend's Bun dependencies and Go vendor sources as offline Flatpak sources, add the frontend build step, run `flatpak-builder` on Linux, and complete the Flathub review. Do not submit the current draft while those sources are missing.

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
