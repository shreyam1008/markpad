# Markpad — Packaging Guide

Publisher: Shreyam Adhikari (shreyam1008@gmail.com)
Version: 0.8.0

---

## Files in this directory

| Path | Purpose |
| --- | --- |
| `linux/markpad.desktop` | Linux desktop entry |
| `linux/markpad.svg` | Scalable app icon |
| `linux/io.github.markpad.metainfo.xml` | AppStream metadata |
| `linux/io.github.markpad.flatpak.yml` | Flatpak manifest for Flathub |
| `windows/installer.nsi` | NSIS Windows installer script |
| `winget/manifests/…` | WinGet manifests |
| `scoop/markpad.json` | Scoop bucket manifest |
| `../snap/snapcraft.yaml` | Snap Store packaging |

---

## Step 0: Prepare release artifacts

Before submitting to any store, create a GitHub Release with:

```
markpad-setup.exe        (Windows NSIS installer — built by CI)
markpad-linux-amd64      (or AppImage — built by CI)
```

---

## 1. Snap Store (Linux — faster path than Flathub)

### Build

```bash
sudo snap install snapcraft --classic
cd /home/shre/Desktop/me/markpad
snapcraft

# Produces: markpad_0.8.0_amd64.snap
```

### Register and upload

```bash
snapcraft login
snapcraft register markpad
snapcraft upload markpad_0.8.0_amd64.snap --release=stable
```

### Snap Store dashboard

https://snapcraft.io/account

---

## 2. Flathub

### Generate Go vendor sources for offline build

```bash
# Tool: https://github.com/flatpak/flatpak-builder-tools/tree/master/go-vendor
python3 flatpak-go-vendor.py go.sum > packaging/linux/go-vendor-sources.json
```

### Replace placeholder commit SHA

```bash
git ls-remote https://github.com/shreyam1008/markpad refs/tags/v0.8.0
# Paste the SHA into packaging/linux/io.github.markpad.flatpak.yml
```

### Test locally

```bash
flatpak install org.gnome.Platform//48 org.gnome.Sdk//48
flatpak install org.freedesktop.Sdk.Extension.golang
flatpak-builder --force-clean build-dir packaging/linux/io.github.markpad.flatpak.yml
flatpak-builder --run build-dir packaging/linux/io.github.markpad.flatpak.yml markpad
```

### Submit to Flathub

1. Fork https://github.com/flathub/flathub
2. Create directory `io.github.markpad/`
3. Add `io.github.markpad.yml`, `go-vendor-sources.json`, icon, metainfo, desktop file
4. Desktop Icon ID must be `io.github.markpad` (update `markpad.desktop` Icon field)
5. Submit PR — follow https://docs.flathub.org/docs/for-app-authors/submission

---

## 3. WinGet

### Get installer sha256

```powershell
certutil -hashfile markpad-setup.exe SHA256
```

### Steps

1. Fork https://github.com/microsoft/winget-pkgs
2. Copy `packaging/winget/manifests/s/ShreyamAdhikari/Markpad/0.8.0/` into your fork at the same path
3. Replace placeholder `InstallerSha256` with real value
4. Validate:

```powershell
winget validate manifests/s/ShreyamAdhikari/Markpad/0.8.0/
```

5. Submit PR

### After approval

```powershell
winget install ShreyamAdhikari.Markpad
```

---

## 4. Scoop

### Get installer sha256

```powershell
certutil -hashfile markpad-setup.exe SHA256
```

### Create the bucket repo

```bash
# On GitHub: create repo named "scoop-bucket" (or reuse from dbterm)
# Add: bucket/markpad.json
```

### Edit markpad.json

Replace `TODO_replace_with_sha256_of_markpad-setup.exe` in `packaging/scoop/markpad.json` with the real value.

### Users install with

```powershell
scoop bucket add shreyam1008 https://github.com/shreyam1008/scoop-bucket
scoop install markpad
```

---

## Release checklist

- [ ] `go test ./...` passes
- [ ] `gofmt -w .` clean
- [ ] CI builds Linux binary + Windows installer
- [ ] GitHub Release tag created with artifacts attached
- [ ] `io.github.markpad.metainfo.xml` release entry added
- [ ] Snap version bumped in `snap/snapcraft.yaml`
- [ ] Flatpak manifest commit SHA updated
- [ ] WinGet sha256 updated
- [ ] Scoop json sha256 updated
