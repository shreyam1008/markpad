#!/bin/sh
set -eu

BINARY="${MARKPAD_SMOKE_BINARY:-dist/markpad}"
TIMEOUT_SECONDS="${MARKPAD_SMOKE_TIMEOUT_SECONDS:-10}"

if [ ! -x "$BINARY" ]; then
	echo "FAIL desktop smoke: missing executable $BINARY" >&2
	exit 1
fi

tmp="${TMPDIR:-/tmp}/markpad-smoke.$$"
mkdir -p "$tmp/home" "$tmp/xdg-config" "$tmp/xdg-cache" "$tmp/xdg-data"
log="$tmp/markpad.log"

all_pids() {
	root="$1"
	[ -d "/proc/$root" ] || return 0
	printf "%s\n" "$root"
	for child in $(pgrep -P "$root" 2>/dev/null || true); do
		all_pids "$child"
	done
}

cleanup() {
	if [ "${pid:-}" ]; then
		kill_list="$(all_pids "$pid" | awk '!seen[$0]++' | tr '\n' ' ')"
		[ -n "$kill_list" ] && kill -TERM $kill_list 2>/dev/null || true
		sleep 0.3
		[ -n "$kill_list" ] && kill -KILL $kill_list 2>/dev/null || true
	fi
	rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

HOME="$tmp/home" \
XDG_CONFIG_HOME="$tmp/xdg-config" \
XDG_CACHE_HOME="$tmp/xdg-cache" \
XDG_DATA_HOME="$tmp/xdg-data" \
MARKPAD_DEBUG_BOOT=1 \
"$BINARY" >"$log" 2>&1 &
pid=$!

elapsed=0
while [ "$elapsed" -lt "$TIMEOUT_SECONDS" ]; do
	if ! kill -0 "$pid" 2>/dev/null; then
		echo "FAIL desktop smoke: app exited before DOM probe" >&2
		cat "$log" >&2 || true
		exit 1
	fi
	if grep -q 'Markpad DOM probe' "$log"; then
		break
	fi
	sleep 1
	elapsed=$((elapsed + 1))
done

if ! grep -q 'Markpad DOM probe' "$log"; then
	echo "FAIL desktop smoke: DOM probe missing after ${TIMEOUT_SECONDS}s" >&2
	cat "$log" >&2 || true
	exit 1
fi

if ! grep -q '"appFound":true' "$log"; then
	echo "FAIL desktop smoke: #app missing" >&2
	cat "$log" >&2 || true
	exit 1
fi

if ! grep -Eq '"appRect":\{"width":[1-9][0-9]*,"height":[1-9][0-9]*\}' "$log"; then
	echo "FAIL desktop smoke: #app has no rendered size" >&2
	cat "$log" >&2 || true
	exit 1
fi

echo "Desktop smoke OK"
grep 'Markpad DOM probe' "$log" | tail -1
