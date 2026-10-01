#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root/dist"
sha256sum -c Markpad.AppImage.sha256
mkdir -p debian-appimage
cp Markpad.AppImage Markpad.AppImage.sha256 "$root/.github/scripts/debian-appimage-smoke.sh" debian-appimage/
expected_version="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' "$root/frontend/package.json")"
sudo modprobe fuse
docker run --rm --device /dev/fuse --cap-add SYS_ADMIN \
  --security-opt apparmor=unconfined \
  -e QUILLPANE_EXPECTED_VERSION="$expected_version" \
  -v "$PWD/debian-appimage:/test" debian:13 \
  bash -euc '
    apt-get update
    apt-get install -y --no-install-recommends \
      libfuse2t64 fuse3 libgtk-3-0t64 libwebkit2gtk-4.1-0 \
      xvfb xauth xdotool imagemagick tesseract-ocr dbus-x11 fonts-dejavu
    useradd -m tester
    chown -R tester:tester /test
    su -s /bin/bash tester -c "bash /test/debian-appimage-smoke.sh"
  '
