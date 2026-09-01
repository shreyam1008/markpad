# Markpad packaging guide

Publisher: Shreyam Adhikari (`shreyam1008@gmail.com`)

Release target: v0.11.0

## GitHub release first

Push `main`, wait for CI, then push only the annotated release tag. `.github/workflows/release.yml` builds:

- `markpad`, `markpad_0.11.0_amd64.deb`, and `Markpad.AppImage` for Linux.
- `markpad-setup.exe` for Windows, with the Markpad ICO embedded into both application and installer.
- `Markpad.dmg` and `Markpad-macOS.zip`, with the Markpad ICNS in the app bundle.

Verify all artifacts before submitting to a store. Do not publish a Scoop, WinGet, or Flatpak manifest with a placeholder hash or commit ID.

## Product icon contract

`packaging/linux/markpad.svg` is the canonical product mark. Run `python packaging/icons/generate_icons.py` after changing it; that command regenerates the Windows ICO and macOS ICNS and synchronizes the frontend SVG/favicon asset. Then regenerate the checked-in Windows resource objects for `amd64` and `arm64` with `go-winres`. The resource objects make an ordinary local `go build` show the proper executable and taskbar icon instead of reserving branding for CI release builds.

## Snap Store

`snap/snapcraft.yaml` builds the frozen Bun frontend before Go. Build and inspect locally:

```sh
sudo snap install snapcraft --classic
snapcraft
snap install --dangerous ./markpad_0.11.0_amd64.snap
```

After smoke testing:

```sh
snapcraft login
snapcraft upload markpad_0.11.0_amd64.snap --release=stable
```

The Snap Store operation is external and is not performed by the GitHub release workflow.

## Flatpak

The Flatpak manifest needs the immutable commit for the published `v0.11.0` tag and vendored Go sources. Generate those after the tag exists, validate with `flatpak-builder`, and submit the resulting manifest to Flathub. Do not guess the commit ID in advance.

## WinGet

After `markpad-setup.exe` exists:

1. Compute its SHA-256 (`Get-FileHash markpad-setup.exe -Algorithm SHA256`).
2. Create a new `0.11.0` manifest directory from the previous version.
3. Update download URL, package version, and installer hash.
4. Run `winget validate` and submit to `microsoft/winget-pkgs`.

Never edit a historical version directory in place.

## Scoop

After the Windows installer exists, update `packaging/scoop/markpad.json` with version `0.11.0`, the exact release URL, and the real SHA-256. Validate installation from a test bucket before publishing it. The repository copy is only a template while its hash is a placeholder; do not advertise it as installable.

## Final checklist

- `make setup`, `make check`, and `git diff --check` passed before tagging.
- Version and 2026-09-01 release date are synchronized in source and non-hash packaging metadata.
- AppStream metadata validates.
- Windows application and NSIS installer show the expected ICO.
- macOS bundle contains `Contents/Resources/markpad.icns` and its plist references it.
- GitHub artifacts launch and complete the folder/search/delete smoke flow.
- Store manifests contain real hashes/commit IDs generated from the published release.
