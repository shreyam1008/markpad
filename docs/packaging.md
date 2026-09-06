# Packaging

Markpad targets small native artifacts without Electron or a bundled browser runtime. The generated frontend is required input to every Go build because `frontend_assets.go` embeds `frontend/dist`.

## Local Linux build

Install Go 1.24+, Bun 1.3.14, GCC, pkg-config, GTK 3 development files, and WebKit2GTK 4.1 development files. Then run:

```sh
make setup
make check
./dist/markpad README.md
```

`make setup` uses the frozen Bun lockfile. `make check` builds the frontend, runs frontend and Go verification, checks runtime assets and formatting, creates the stripped Linux binary, and enforces the 16 MiB ceiling.

## Release CI

Pushing one explicit annotated tag such as `v0.13.3` starts `.github/workflows/release.yml`. Each operating-system job installs pinned Bun dependencies and builds `frontend/dist` before compiling Go. The Linux job must also pass the native rendered-window smoke test.

The release contains:

- Linux standalone binary, `.deb`, and AppImage.
- Windows NSIS installer with embedded application/installer icon.
- macOS app bundle in DMG and ZIP form with an ICNS icon.

## Release checklist

1. Synchronize the version in `main.go`, frontend metadata, Snap, macOS plist, AppStream, website schema, UI About/Changelog, README, and roadmap.
2. Update the AppStream release date and notes.
3. Run `make setup`, `make check`, and `git diff --check`.
4. Smoke-test open/edit/save/reopen, folder browse, `Ctrl+P`, `Ctrl+Shift+F`, result selection, create, refresh, and confirmed deletion.
5. Push `main` and wait for CI.
6. Push only the intended annotated version tag; do not use `git push --tags`.
7. Verify every expected artifact and its application icon before announcing the release.

Store manifests that need release hashes or commit IDs are updated only after GitHub artifacts exist. Signing/notarization and store submissions remain separate distribution work.
