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

printf 'Clipboard sentinel 12345\n' >dist/clipboard-smoke.md
dbus-run-session -- ./dist/markpad "$PWD/dist/clipboard-smoke.md" >dist/linux-ui-smoke.log 2>&1 &
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

if ! grep -Eqi 'Untitled|New' dist/linux-ui-smoke.txt; then
  cat dist/linux-ui-smoke.log
  cat dist/linux-ui-smoke.txt
  echo "Quillpane opened a window, but its application UI did not render" >&2
  exit 1
fi

if grep -Eqi 'File[[:space:]]+Edit[[:space:]]+View[[:space:]]+Settings[[:space:]]+Help' dist/linux-ui-smoke.txt; then
  cat dist/linux-ui-smoke.txt
  echo "Quillpane rendered a redundant native Linux application menu above its custom title bar" >&2
  exit 1
fi

echo "Linux UI smoke passed: visible Quillpane content rendered without a duplicate native menu."

# Exercise the OS clipboard from rendered Markdown, not a browser-only mock.
tesseract dist/linux-ui-smoke.png stdout --psm 6 tsv 2>>dist/linux-ui-smoke.log >dist/linux-ui-smoke.tsv
read -r word_x word_y < <(awk -F '\t' '$12 == "sentinel" { print int($7+$9/2), int($8+$10/2); exit }' dist/linux-ui-smoke.tsv)
if [[ -z "${word_x:-}" || -z "${word_y:-}" ]]; then
  echo "Clipboard test text did not render" >&2
  exit 1
fi
xdotool windowfocus --sync "$window_id"
xdotool mousemove --window "$window_id" "$word_x" "$word_y" click --repeat 2 --delay 100 1
xdotool key --clearmodifiers ctrl+c
sleep 0.5
import -display "$DISPLAY" -window "$window_id" dist/linux-ui-clipboard.png
copied="$(timeout 5 xclip -selection clipboard -o -target UTF8_STRING)"
if [[ "${copied// /}" != "sentinel" ]]; then
  echo "Preview Ctrl+C did not copy the selected word" >&2
  exit 1
fi
xdotool key --clearmodifiers ctrl+x
sleep 0.5
copied="$(timeout 5 xclip -selection clipboard -o -target UTF8_STRING)"
if [[ "${copied// /}" != "sentinel" ]] || [[ "$(cat dist/clipboard-smoke.md)" != "Clipboard sentinel 12345" ]]; then
  echo "Preview Cut did not preserve clipboard text and source file" >&2
  exit 1
fi
echo "Linux native preview clipboard smoke passed."

xdotool key --clearmodifiers F1
sleep 1
import -display "$DISPLAY" -window "$window_id" dist/linux-ui-help.png
tesseract dist/linux-ui-help.png stdout --psm 6 2>>dist/linux-ui-smoke.log >dist/linux-ui-help.txt
grep -Eqi 'Installed version' dist/linux-ui-help.txt
grep -Eqi 'Check for updates' dist/linux-ui-help.txt
echo "Linux Help and update controls are reachable with F1."

# Open the locally bundled Driver.js tour using the visible Help control.
tesseract dist/linux-ui-help.png stdout --psm 6 tsv 2>>dist/linux-ui-smoke.log >dist/linux-ui-help.tsv
read -r tour_x tour_y < <(awk -F '\t' '$12 == "guided" { print int($7+$9/2), int($8+$10/2); exit }' dist/linux-ui-help.tsv)
[[ -n "${tour_x:-}" && -n "${tour_y:-}" ]]
xdotool mousemove --window "$window_id" "$tour_x" "$tour_y" click 1
sleep 1
import -display "$DISPLAY" -window "$window_id" dist/linux-ui-tour.png
tesseract dist/linux-ui-tour.png stdout --psm 6 2>>dist/linux-ui-smoke.log >dist/linux-ui-tour.txt
grep -Eqi 'Welcome to Quillpane' dist/linux-ui-tour.txt
xdotool key --clearmodifiers Escape
sleep 0.5
xdotool key --clearmodifiers F1
sleep 0.5
import -display "$DISPLAY" -window "$window_id" dist/linux-ui-tour-return.png
tesseract dist/linux-ui-tour-return.png stdout --psm 6 2>>dist/linux-ui-smoke.log >dist/linux-ui-tour-return.txt
grep -Eqi 'Installed version' dist/linux-ui-tour-return.txt
echo "Linux Driver.js tour opens and returns safely to Help."
