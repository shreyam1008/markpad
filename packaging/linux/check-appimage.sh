#!/usr/bin/env bash
set -euo pipefail

image="$(realpath "${1:?Usage: check-appimage.sh IMAGE BINARY}")"
binary="$(realpath "${2:?Usage: check-appimage.sh IMAGE BINARY}")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
"$image" --appimage-extract > /dev/null

if [[ ! -x squashfs-root/AppRun ]]; then
  echo "AppImage has no executable AppRun entrypoint" >&2
  exit 1
fi
if [[ "$(readlink squashfs-root/AppRun)" != usr/bin/markpad ]]; then
  echo "AppImage AppRun does not point to usr/bin/markpad" >&2
  exit 1
fi
cmp "$binary" squashfs-root/AppRun
desktop-file-validate squashfs-root/markpad.desktop
echo "AppImage check passed: executable AppRun resolves to the verified production binary."
sha256sum "$image" "$binary"
