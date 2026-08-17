# Packaging

Markpad targets small native artifacts without Electron or a bundled browser runtime.

## Prerequisites

- Go 1.24 or newer.
- Bun 1.3 or newer.
- Wails 2.12 for development builds.
- ripgrep for quality and asset-policy checks.
- GTK 3 and WebKitGTK 4.1 development packages on Linux.

## Local build

```sh
make setup
make check
make build
./dist/markpad README.md
```

`make setup` installs exactly the versions in `frontend/bun.lock`. `make build` type-checks and bundles `frontend/dist` before compiling the production Go binary that embeds those assets.

For live development, run `wails dev`. The commands used by Wails are defined in `wails.json`.

## Release CI

`.github/workflows/release.yml` verifies the frontend and Go code, then builds these artifacts when a `vX.Y.Z` tag is pushed:

- Linux x86-64 binary (requires GTK 3 and WebKitGTK 4.1 at runtime)
- Linux `.deb`
- Windows `.exe` and NSIS installer
- macOS arm64 and x86-64 `.dmg` files with zipped `.app` fallbacks

## Release checklist

- Update `Version` in `main.go` and the versioned packaging metadata.
- Run `make setup && make check`.
- Run `make check-size` and confirm the release-size ceiling.
- Smoke test opening, editing, saving, restoring, and closing a Markdown file and a plain-text file.
- Confirm PDF external handoff and image preview still work offline.
- Confirm `packaging/linux/markpad.svg` and desktop metadata are present.
- Tag the release with `vX.Y.Z`.

## Future packaging work

- Add signed/notarized macOS releases.
- Build a dependency-bundled AppImage with an executable `AppRun`, then add an install/launch smoke test.
- Complete reproducible offline frontend builds for the Flatpak and Snap drafts.
- Add a generated PNG/icon pipeline if target stores require raster icons.
