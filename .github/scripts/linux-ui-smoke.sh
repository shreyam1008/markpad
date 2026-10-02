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
{
  printf '# First note\r\nUnicode compass 🧭 writing\r\n'
  for _ in $(seq 1 65); do printf 'An ordinary line of writing.\r\n'; done
  printf 'Morning orchard plan\r\n'
} >dist/search-first.md
printf '# Second note\n\nEvening orchard walk\n' >dist/search-second.md
printf '// Source notes\r\n// 🧭 Keep local notes\r\nconst orchard = '\''code-needle'\'';\r\n' >dist/search-code.ts
sha256sum dist/clipboard-smoke.md dist/search-first.md dist/search-second.md dist/search-code.ts >dist/linux-ui-search-source.sha256
dbus-run-session -- ./dist/markpad "$PWD/dist/search-first.md" "$PWD/dist/search-second.md" "$PWD/dist/search-code.ts" "$PWD/dist/clipboard-smoke.md" >dist/linux-ui-smoke.log 2>&1 &
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
read -r tour_x tour_y < <(awk -F '\t' '$12 == "guided" { print int($7+$9/2), int($8+$10/2); exit }' dist/linux-ui-help.tsv) || true
# Colored primary-button text can be missed by OCR. Anchor to the visible
# section's left edge and the adjacent About button on the same action row.
if [[ -z "${tour_x:-}" || -z "${tour_y:-}" ]]; then
  read -r tour_x tour_y < <(awk -F '\t' '$12 == "Make" { x=$7+18 } $12 == "About" { y=int($8+$10/2) } END { if (x && y) print x,y }' dist/linux-ui-help.tsv) || true
fi
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

# Verify content search in the actual GTK/WebKit window with native keyboard
# input, rendered snippets, and exact selection read back from the OS clipboard.
capture_search() {
  local name="$1"
  import -display "$DISPLAY" -window "$window_id" "dist/linux-ui-${name}.png"
  tesseract "dist/linux-ui-${name}.png" stdout --psm 6 2>>dist/linux-ui-smoke.log >"dist/linux-ui-${name}.txt"
}
paste_query() {
  printf '%s' "$1" | xclip -selection clipboard
  xdotool key --clearmodifiers ctrl+a ctrl+v
  sleep 0.5
}
assert_selection() {
  xdotool key --clearmodifiers ctrl+c
  sleep 0.3
  local selection
  selection="$(timeout 5 xclip -selection clipboard -o -target UTF8_STRING)"
  if [[ "$selection" != "$1" ]]; then
    echo "Search selected '$selection', expected exact text '$1'" >&2
    exit 1
  fi
}

xdotool key --clearmodifiers Escape ctrl+1
sleep 0.3
xdotool mousemove --window "$window_id" 600 300 click 1
xdotool key --clearmodifiers ctrl+End Return
xdotool type --clearmodifiers 'Unflushed marigold change'
# Open immediately after editing so active content cannot rely on disk autosave.
xdotool key --clearmodifiers ctrl+shift+f
sleep 0.5
paste_query 'marigold'
capture_search search-unsaved-edit
grep -Eqi 'Unflushed.*marigold|marigold.*change' dist/linux-ui-search-unsaved-edit.txt
xdotool key --clearmodifiers Return
sleep 0.5
assert_selection 'marigold'
[[ "$(cat dist/clipboard-smoke.md)" == 'Clipboard sentinel 12345' ]]

xdotool key --clearmodifiers ctrl+shift+f
sleep 0.3
paste_query 'orchard'
capture_search search-open-notes
grep -Eqi 'Morning.*orchard|orchard.*plan' dist/linux-ui-search-open-notes.txt
grep -Eqi 'Evening.*orchard|orchard.*walk' dist/linux-ui-search-open-notes.txt

# A specific phrase targets the distant line in the first note. Native copy
# proves selection of the complete match; visible context proves it was revealed.
paste_query 'Morning orchard'
xdotool key --clearmodifiers Return
sleep 0.5
assert_selection 'Morning orchard'
capture_search search-exact-line
grep -Eqi 'Morning.*orchard.*plan' dist/linux-ui-search-exact-line.txt
[[ "$(tail -n 1 dist/search-first.md)" == $'Morning orchard plan\r' ]]

xdotool key --clearmodifiers ctrl+f
sleep 0.3
paste_query 'orchard'
capture_search find-current-note
grep -Eqi '1[[:space:]]+of[[:space:]]+1' dist/linux-ui-find-current-note.txt
xdotool key --clearmodifiers Return
sleep 0.3
xdotool key --clearmodifiers Escape
sleep 0.3
assert_selection 'orchard'
xdotool key --clearmodifiers ctrl+shift+f
sleep 0.3
paste_query 'orcherd'
capture_search search-typo-off
grep -Eqi 'No (results|matches|matching)' dist/linux-ui-search-typo-off.txt
tesseract dist/linux-ui-search-typo-off.png stdout --psm 6 tsv 2>>dist/linux-ui-smoke.log >dist/linux-ui-search-typo-off.tsv
read -r typo_x typo_y < <(awk -F '\t' '$12 == "Allow" { print int($7+$9/2), int($8+$10/2); exit }' dist/linux-ui-search-typo-off.tsv)
[[ -n "${typo_x:-}" && -n "${typo_y:-}" ]]
xdotool mousemove --window "$window_id" "$typo_x" "$typo_y" click 1
sleep 0.5
capture_search search-one-typo
grep -Eqi 'Morning.*orchard|orchard.*plan' dist/linux-ui-search-one-typo.txt
grep -Eqi 'Evening.*orchard|orchard.*walk' dist/linux-ui-search-one-typo.txt

xdotool key --clearmodifiers Escape ctrl+n
sleep 0.3
xdotool mousemove --window "$window_id" 600 300 click 1
printf '# A fresh thought\nA violet comet worth remembering.\n' | xclip -selection clipboard
xdotool key --clearmodifiers ctrl+a ctrl+v ctrl+shift+f
sleep 0.5
paste_query 'violet'
capture_search search-unsaved-draft
grep -Eqi 'violet.*comet|comet.*worth' dist/linux-ui-search-unsaved-draft.txt
xdotool key --clearmodifiers Return
sleep 0.5
assert_selection 'violet'

xdotool key --clearmodifiers ctrl+shift+f
sleep 0.3
paste_query 'code-needle'
xdotool key --clearmodifiers Return
sleep 0.5
assert_selection 'code-needle'
capture_search search-code-selection
grep -Eqi 'const.*orchard|orchard.*code-needle' dist/linux-ui-search-code-selection.txt
[[ "$(tail -n 1 dist/search-code.ts)" == "const orchard = 'code-needle';"$'\r' ]]
sha256sum --check dist/linux-ui-search-source.sha256

echo "Linux native content search passed: open notes, latest unsaved edits, a new draft, exact distant and CodeMirror selection with CRLF/Unicode, current-note find, and opt-in one-typo search."
