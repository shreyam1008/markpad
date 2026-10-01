#!/usr/bin/env bash
set -euo pipefail

# Run inside the disposable Debian 13 CI container as an unprivileged user.
cd /test
mkdir -p dist
cat /etc/os-release
test "$(. /etc/os-release; echo "$VERSION_ID")" = 13
export DISPLAY=:99
export XDG_CONFIG_HOME="$(mktemp -d)"
export LIBGL_ALWAYS_SOFTWARE=1
app_pid=""
xvfb_pid=""
cleanup() {
  if [[ -n "$app_pid" ]]; then kill "$app_pid" 2>/dev/null || true; fi
  if [[ -n "$xvfb_pid" ]]; then kill "$xvfb_pid" 2>/dev/null || true; fi
  rm -rf "$XDG_CONFIG_HOME"
}
trap cleanup EXIT

sha256sum -c Markpad.AppImage.sha256
chmod +x Markpad.AppImage
Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp >dist/xvfb.log 2>&1 &
xvfb_pid=$!
for _ in $(seq 1 40); do
  if xdotool getdisplaygeometry >/dev/null 2>&1; then break; fi
  kill -0 "$xvfb_pid"
  sleep 0.25
done
xdotool getdisplaygeometry >/dev/null

printf 'AppImage sentinel 12345\n' >dist/appimage-smoke.md
# Exercise the normal FUSE launch path; do not bypass the AppImage runtime.
unset APPIMAGE_EXTRACT_AND_RUN
dbus-run-session -- ./Markpad.AppImage "$PWD/dist/appimage-smoke.md" >dist/appimage.log 2>&1 &
app_pid=$!
window_id=""
for _ in $(seq 1 120); do
  window_id="$(xdotool search --onlyvisible --name Quillpane 2>/dev/null | head -n 1 || true)"
  if [[ -n "$window_id" ]]; then break; fi
  if ! kill -0 "$app_pid" 2>/dev/null; then cat dist/appimage.log; exit 1; fi
  sleep 0.25
done
test -n "$window_id"

# Wait for the native webview to render the file passed through AppRun.
for _ in $(seq 1 20); do
  import -display "$DISPLAY" -window "$window_id" dist/appimage.png
  tesseract dist/appimage.png stdout --psm 11 2>>dist/appimage.log >dist/appimage.txt
  if grep -q 'AppImage sentinel 12345' dist/appimage.txt; then break; fi
  sleep 0.5
done
grep -q 'AppImage sentinel 12345' dist/appimage.txt
xdotool windowfocus --sync "$window_id"
xdotool key --clearmodifiers F1
sleep 1
import -display "$DISPLAY" -window "$window_id" dist/help.png
tesseract dist/help.png stdout --psm 11 2>>dist/appimage.log >dist/help.txt
grep -qi 'Installed version' dist/help.txt
grep -Fq "$QUILLPANE_EXPECTED_VERSION" dist/help.txt
grep -qi 'Check for updates' dist/help.txt
echo "Debian 13 AppImage smoke passed: normal FUSE launch, file argument, rendered content, and matching installed version."
