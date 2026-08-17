# Markpad packaging notes

The supported packaging path is `.github/workflows/release.yml`. A `v*` tag first runs the complete verification job, then produces the Linux x86-64 binary and `.deb`, Windows executable/NSIS installer, and arm64/x86-64 macOS DMG/zipped apps.

## Files

| Path | Purpose | Status |
|---|---|---|
| `linux/markpad.desktop` | Linux desktop entry | Used by release CI |
| `linux/markpad.svg` | Application icon | Used by release CI |
| `linux/io.github.markpad.metainfo.xml` | AppStream metadata | Used by release CI |
| `windows/installer.nsi` | Windows installer | Used by release CI |
| `macos/Info.plist` | macOS bundle metadata | Used by release CI |
| `winget/manifests/` | Versioned WinGet submissions | Manual publishing |
| `scoop/markpad.json` | Versioned Scoop manifest | Manual publishing |
| `linux/io.github.markpad.flatpak.yml` | Flathub draft | Not release-ready |
| `../snap/snapcraft.yaml` | Snap Store draft | Not release-ready |

AppImage is not a supported artifact yet. A future AppImage must bundle its GTK/WebKit dependencies, provide an executable root `AppRun`, and pass an install/launch smoke test before it is advertised.

## Release preparation

1. Update versions in `main.go`, the package metadata, and versioned store manifests.
2. Run `make setup && make check`.
3. Run `make check-size` on a Linux machine with GTK/WebKitGTK development packages.
4. Smoke test open/edit/save/reopen, Save As failure, history restore, image preview, and PDF handoff.
5. Push a `vX.Y.Z` tag and confirm the verify job succeeds before platform builds begin.
6. Download and smoke test each artifact before publishing store manifests.

## Store manifests

WinGet and Scoop entries contain release URLs and hashes, so each version must be updated from the actual published installer. Do not reuse a previous version's checksum or edit an already-published version to describe a different binary.

The Flatpak and Snap drafts are not currently supported release paths. Production Go builds require `frontend/dist`; a store build must therefore provide Bun and all locked frontend packages offline, run the frozen frontend install/build, and only then compile Go. Do not submit either draft until that reproducible offline pipeline and a smoke test exist.
