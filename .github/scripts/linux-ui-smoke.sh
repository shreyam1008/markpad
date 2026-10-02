#!/usr/bin/env bash
set -Eeuo pipefail

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

report_failure() {
  local exit_code="$1" line="$2" command="$3"
  trap - ERR
  printf 'Linux native smoke failed at line %s (exit %s): %s\n' "$line" "$exit_code" "$command" | tee -a dist/linux-ui-smoke.log >&2
  if [[ -n "${window_id:-}" ]]; then
    import -display "$DISPLAY" -window "$window_id" dist/linux-ui-search-failure.png 2>>dist/linux-ui-smoke.log || true
    tesseract dist/linux-ui-search-failure.png stdout --psm 6 2>>dist/linux-ui-smoke.log >dist/linux-ui-search-failure.txt || true
  fi
  return "$exit_code"
}
trap 'report_failure "$?" "$LINENO" "$BASH_COMMAND"' ERR

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
# An inactive editable text note must span native search pages. Ordinary short
# lines keep this test about paging and exact offsets, rather than long-line layout.
{
  printf 'Plain text paging fixture\r\nUnicode compass 🧭 and cedar café\r\n'
  for _ in $(seq 1 20000); do printf 'Quiet cedar paths beside a calm river carry patient afternoon light.\r\n'; done
  printf 'Cypress paging marker: cypress paging needle beside the far bank.\r\n'
} >dist/search-paged.txt
paged_units=$(( $(iconv -f UTF-8 -t UTF-16LE dist/search-paged.txt | wc -c) / 2 ))
paged_bytes="$(wc -c <dist/search-paged.txt)"
(( paged_units > 1048576 && paged_bytes < 2097152 ))
printf 'Paging fixture: %s UTF-16 units; %s UTF-8 bytes\n' "$paged_units" "$paged_bytes" >dist/linux-ui-search-paging-fixture.txt
sha256sum dist/clipboard-smoke.md dist/search-first.md dist/search-second.md dist/search-code.ts dist/search-paged.txt >dist/linux-ui-search-source.sha256
dbus-run-session -- ./dist/markpad "$PWD/dist/search-first.md" "$PWD/dist/search-second.md" "$PWD/dist/search-code.ts" "$PWD/dist/search-paged.txt" "$PWD/dist/clipboard-smoke.md" >dist/linux-ui-smoke.log 2>&1 &
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
  # A failed copy must not pass because paste_query already put the expected
  # query on the clipboard. Replace it before reading the native selection.
  local expected="$1" sentinel='__search_selection_not_copied__' selection=""
  local attempt=0 started deadline now remaining read_timeout read_status=0
  local trace='dist/linux-ui-search-clipboard.log'
  printf '%s' "$sentinel" | xclip -selection clipboard
  if ! selection="$(timeout 2 xclip -selection clipboard -o -target UTF8_STRING 2>>"$trace")" || [[ "$selection" != "$sentinel" ]]; then
    echo "Could not confirm the native clipboard sentinel before Ctrl+C for '$expected'" >&2
    return 1
  fi
  started="$(date +%s%3N)"
  deadline=$((started + 10000))
  # Loading a large note activates a new native editor asynchronously. Retry
  # copying its existing selection until X11 supplies the complete exact text.
  # A missing target, stale query, or partial selection never counts as success.
  while (( $(date +%s%3N) < deadline )); do
    attempt=$((attempt + 1))
    xdotool key --clearmodifiers ctrl+c
    sleep 0.1
    now="$(date +%s%3N)"
    remaining=$((deadline - now))
    if (( remaining <= 0 )); then break; fi
    if (( remaining > 1000 )); then remaining=1000; fi
    printf -v read_timeout '%d.%03ds' "$((remaining / 1000))" "$((remaining % 1000))"
    printf 'Ctrl+C expected=%q attempt=%s elapsed=%sms\n' "$expected" "$attempt" "$((now - started))" >>"$trace"
    if selection="$(timeout "$read_timeout" xclip -selection clipboard -o -target UTF8_STRING 2>>"$trace")"; then
      now="$(date +%s%3N)"
      if [[ "$selection" == "$expected" ]]; then
        printf 'Exact native selection copied after %s attempts in %sms\n' "$attempt" "$((now - started))" >>"$trace"
        return 0
      fi
      read_status=0
      printf 'Clipboard mismatch: %s characters, preview=%q\n' "${#selection}" "${selection:0:120}" >>"$trace"
    else
      read_status=$?
      now="$(date +%s%3N)"
      printf 'Clipboard read failed: exit=%s elapsed=%sms\n' "$read_status" "$((now - started))" >>"$trace"
    fi
    sleep 0.15
  done
  printf 'Final clipboard targets for failed native selection:\n' >>"$trace"
  timeout 1 xclip -selection clipboard -o -target TARGETS >>"$trace" 2>&1 || true
  echo "Native Ctrl+C did not copy the full selected source '$expected' within 10 seconds (attempts=$attempt, last read exit=$read_status); see $trace" >&2
  return 1
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
# Whole-window block OCR can omit this isolated small count. Read its actual
# pixels at the fixed 36 + 42 + 34 px shell offset, enlarged for single-line OCR.
find_count_left=$(( $(identify -format '%w' dist/linux-ui-find-current-note.png) - 195 ))
convert dist/linux-ui-find-current-note.png -crop "80x44+${find_count_left}+110" +repage -resize 300% dist/linux-ui-find-count.png
tesseract dist/linux-ui-find-count.png stdout --psm 7 -c tessedit_char_whitelist=0123456789of 2>>dist/linux-ui-smoke.log >dist/linux-ui-find-count.txt
grep -Eqi '(^|[^0-9])1[[:space:]]*of[[:space:]]*1([^0-9]|$)' dist/linux-ui-find-count.txt
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
# Query remains focused. Its next semantic control is the typo checkbox;
# native Tab/Space verifies keyboard access without OCR-derived coordinates.
xdotool key --clearmodifiers Tab space
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

# This saved note has stayed inactive, so finding its distant literal requires
# the native paged reader, complete-note assembly, and exact Unicode/CRLF offsets.
xdotool key --clearmodifiers ctrl+shift+f
sleep 0.3
paste_query 'cypress paging needle'
for _ in $(seq 1 20); do
  capture_search search-paged-notes
  if grep -Eqi 'Cypress.*paging.*marker' dist/linux-ui-search-paged-notes.txt; then
    break
  fi
  sleep 0.25
done
grep -Eqi 'Cypress.*paging.*marker' dist/linux-ui-search-paged-notes.txt
xdotool key --clearmodifiers Return
sleep 0.5
for _ in $(seq 1 20); do
  capture_search search-paged-selection
  if grep -Eqi 'Cypress.*paging.*marker' dist/linux-ui-search-paged-selection.txt &&
    ! grep -Eqi 'Search[[:space:]]+open[[:space:]]+notes' dist/linux-ui-search-paged-selection.txt; then
    break
  fi
  sleep 0.25
done
grep -Eqi 'Cypress.*paging.*marker' dist/linux-ui-search-paged-selection.txt
if grep -Eqi 'Search[[:space:]]+open[[:space:]]+notes' dist/linux-ui-search-paged-selection.txt; then
  echo "Paged result did not navigate from search to the source editor" >&2
  exit 1
fi
assert_selection 'cypress paging needle'
sha256sum --check dist/linux-ui-search-source.sha256

echo "Linux native content search passed: open notes, latest unsaved edits, a new draft, exact distant and CodeMirror selection with CRLF/Unicode, inactive saved-note paging, current-note find, and opt-in one-typo search."
