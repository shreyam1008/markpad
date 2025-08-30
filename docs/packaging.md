# Packaging

Markpad targets small native artifacts without Electron or a bundled browser runtime.

## Local Linux build

```sh
make build-linux-local
./dist/markpad README.md
```

The local build script downloads required development packages into `/tmp/markpad-apt`, extracts headers and pkg-config files into `/tmp/markpad-sysroot`, and builds a stripped binary at `dist/markpad`.

## Standard build

If Gio Linux dependencies are installed system-wide:

```sh
make build
```

## Release CI

`.github/workflows/release.yml` builds these artifacts when a tag like `v0.1.0` is pushed:

- Linux binary
- Linux `.deb`
- Linux AppImage
- Windows `.exe` zip
- macOS `.dmg`

## Release checklist

- Update version in `internal/desktop/app.go`.
- Run `go test ./internal/markdown ./internal/preview ./internal/session ./tests`.
- Run the local Linux build and smoke test opening a `.md` and `.txt` file.
- Confirm `packaging/linux/markpad.svg` and desktop metadata are present.
- Tag the release with `vX.Y.Z`.
- Upload screenshots to the website and README placeholders.

## Future packaging work

- Add signed/notarized macOS releases.
- Add Windows installer/MSI.
- Add AppImage smoke tests in CI.
- Add a generated PNG/icon pipeline if target stores require raster icons.
