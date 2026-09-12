#!/usr/bin/env bash
set -euo pipefail
mkdir -p flatpak-evidence
openbox >flatpak-evidence/window-manager.log 2>&1 &
wm_pid=$!
# Fail at the portal boundary rather than treating a rendered window as proof
# that the sandbox can open a host document.
gdbus call --session --dest org.freedesktop.portal.Documents \
  --object-path /org/freedesktop/portal/documents \
  --method org.freedesktop.portal.Documents.GetMountPoint \
  >flatpak-evidence/document-portal.txt
mountpoint -q "$XDG_RUNTIME_DIR/doc"
flatpak run io.github.shreyam1008.markpad >flatpak-evidence/app.log 2>&1 &
app_pid=$!
trap 'kill "$app_pid" "$wm_pid" 2>/dev/null || true' EXIT
window_id=''
for attempt in $(seq 1 80); do
  window_id=$(xdotool search --onlyvisible --name 'Quillpane' 2>/dev/null | head -n1 || true)
  if [[ -n "$window_id" ]]; then break; fi
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat flatpak-evidence/app.log
    exit 1
  fi
  sleep 0.25
done
test -n "$window_id"
sleep 3
import -window "$window_id" flatpak-evidence/window.png
tesseract flatpak-evidence/window.png flatpak-evidence/window --psm 6
grep -Eqi 'Open a folder|Untitled|New' flatpak-evidence/window.txt
echo 'Flatpak launch and rendered-window smoke test passed.'

# Open a disposable host fixture through the portal, without a filesystem grant.
fixture=$(realpath .github/fixtures/flatpak-note.md)
xdotool windowactivate --sync "$window_id"
xdotool key --clearmodifiers ctrl+o
chooser_id=''
for attempt in $(seq 1 80); do
  chooser_id=$(xdotool search --onlyvisible --class 'Xdg-desktop-portal-gtk' 2>/dev/null | head -n1 || true)
  if [[ -n "$chooser_id" ]]; then break; fi
  sleep 0.25
done
import -window root flatpak-evidence/portal-dialog.png
test -n "$chooser_id"
xdotool windowactivate --sync "$chooser_id"
xdotool key --clearmodifiers ctrl+l
xdotool type --clearmodifiers --delay 10 "$fixture"
xdotool key Return
sleep 3
import -window "$window_id" flatpak-evidence/portal-open.png
tesseract flatpak-evidence/portal-open.png flatpak-evidence/portal-open --psm 6
grep -Eqi 'Quillpane portal check|disposable note' flatpak-evidence/portal-open.txt
echo 'Portal-mediated file open and rendered content passed.'
