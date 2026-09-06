#!/usr/bin/env bash
set -euo pipefail

mkdir -p dist
export DISPLAY=:99
export XDG_CONFIG_HOME="$(mktemp -d)"

app_pid=""
xvfb_pid=""
cleanup() {
  if [[ -n "$app_pid" ]]; then
    kill "$app_pid" 2>/dev/null || true
  fi
  if [[ -n "$xvfb_pid" ]]; then
    kill "$xvfb_pid" 2>/dev/null || true
  fi
  rm -rf "$XDG_CONFIG_HOME"
}
trap cleanup EXIT

Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp >dist/linux-ui-xvfb.log 2>&1 &
xvfb_pid=$!

for _ in $(seq 1 40); do
  if xdotool getdisplaygeometry >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$xvfb_pid" 2>/dev/null; then
    cat dist/linux-ui-xvfb.log
    echo "Xvfb exited before its display became ready" >&2
    exit 1
  fi
  sleep 0.25
done

if ! xdotool getdisplaygeometry >/dev/null 2>&1; then
  cat dist/linux-ui-xvfb.log
  echo "Xvfb display did not become ready" >&2
  exit 1
fi

dbus-run-session -- ./dist/markpad >dist/linux-ui-smoke.log 2>&1 &
app_pid=$!

window_id=""
for _ in $(seq 1 60); do
  window_id="$(xdotool search --onlyvisible --name 'Quillpane' 2>/dev/null | head -n 1 || true)"
  if [[ -n "$window_id" ]]; then
    break
  fi
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat dist/linux-ui-smoke.log
    echo "Quillpane exited before opening a window" >&2
    exit 1
  fi
  sleep 0.25
done

if [[ -z "$window_id" ]]; then
  cat dist/linux-ui-smoke.log
  echo "Quillpane did not open a visible window" >&2
  exit 1
fi

sleep 3
import -display "$DISPLAY" -window "$window_id" dist/linux-ui-smoke.png
tesseract dist/linux-ui-smoke.png stdout --psm 6 2>>dist/linux-ui-smoke.log >dist/linux-ui-smoke.txt

if ! grep -Eqi 'Open a folder|Untitled|New' dist/linux-ui-smoke.txt; then
  cat dist/linux-ui-smoke.log
  cat dist/linux-ui-smoke.txt
  echo "Quillpane opened a window, but its application UI did not render" >&2
  exit 1
fi

echo "Linux UI smoke passed: visible Quillpane content rendered."
