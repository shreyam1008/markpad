#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
appdir="$work/Markpad.AppDir"

mkdir -p "$appdir/usr/bin" "$appdir/usr/share/applications" \
  "$appdir/usr/share/icons/hicolor/scalable/apps" "$appdir/usr/share/metainfo"
install -m 755 "$root/dist/markpad" "$appdir/usr/bin/markpad"
cp "$root/packaging/linux/markpad.desktop" "$appdir/usr/share/applications/"
cp "$root/packaging/linux/markpad.svg" "$appdir/usr/share/icons/hicolor/scalable/apps/"
cp "$root/packaging/linux/markpad.svg" "$appdir/markpad.svg"
cp "$root/packaging/linux/io.github.markpad.metainfo.xml" "$appdir/usr/share/metainfo/"
ln -s usr/share/applications/markpad.desktop "$appdir/markpad.desktop"
# The AppImage runtime executes AppRun, not the desktop file's Exec field.
ln -s usr/bin/markpad "$appdir/AppRun"

cd "$work"
wget -q -O appimagetool \
  "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
chmod +x appimagetool
./appimagetool --appimage-extract > /dev/null
ARCH=x86_64 ./squashfs-root/AppRun "$appdir" "$root/dist/Markpad.AppImage"
bash "$root/packaging/linux/check-appimage.sh" "$root/dist/Markpad.AppImage" "$root/dist/markpad"
cd "$root/dist"
sha256sum Markpad.AppImage > Markpad.AppImage.sha256
