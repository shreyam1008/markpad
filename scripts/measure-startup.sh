#!/bin/sh
set -eu

BINARY="${MARKPAD_STARTUP_BINARY:-dist/markpad}"
TIMEOUT_SECONDS="${MARKPAD_STARTUP_TIMEOUT_SECONDS:-10}"

positive_int() {
	name="$1"
	value="$2"
	case "$value" in
		''|*[!0-9]*)
			echo "FAIL startup: $name must be a positive integer" >&2
			exit 1
			;;
	esac
	if [ "$value" -lt 1 ]; then
		echo "FAIL startup: $name must be a positive integer" >&2
		exit 1
	fi
}

positive_int MARKPAD_STARTUP_TIMEOUT_SECONDS "$TIMEOUT_SECONDS"

if [ ! -x "$BINARY" ]; then
	echo "FAIL startup: missing executable $BINARY" >&2
	exit 1
fi

tmp="$(mktemp -d "${TMPDIR:-/tmp}/markpad-startup.XXXXXX")"
mkdir -p "$tmp/home" "$tmp/xdg-config" "$tmp/xdg-cache" "$tmp/xdg-data"
log="$tmp/markpad.log"
pid=""

all_pids() {
	root="$1"
	[ -d "/proc/$root" ] || return 0
	printf "%s\n" "$root"
	for child in $(pgrep -P "$root" 2>/dev/null || true); do
		all_pids "$child"
	done
}

cleanup() {
	if [ -n "${pid:-}" ]; then
		pids="$(all_pids "$pid" | awk '!seen[$0]++' | tr '\n' ' ')"
		[ -n "$pids" ] && kill -TERM $pids 2>/dev/null || true
		sleep 0.3
		[ -n "$pids" ] && kill -KILL $pids 2>/dev/null || true
	fi
	rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

start_ns="$(date +%s%N)"
HOME="$tmp/home" \
XDG_CONFIG_HOME="$tmp/xdg-config" \
XDG_CACHE_HOME="$tmp/xdg-cache" \
XDG_DATA_HOME="$tmp/xdg-data" \
MARKPAD_DEBUG_BOOT=1 \
"$BINARY" >"$log" 2>&1 &
pid=$!

tick=0
max_ticks=$((TIMEOUT_SECONDS * 10))
while [ "$tick" -lt "$max_ticks" ]; do
	if ! kill -0 "$pid" 2>/dev/null; then
		echo "FAIL startup: app exited before DOM probe" >&2
		cat "$log" >&2 || true
		exit 1
	fi
	if grep -q 'Markpad DOM probe' "$log"; then
		break
	fi
	sleep 0.1
	tick=$((tick + 1))
done

if ! grep -q 'Markpad DOM probe' "$log"; then
	echo "FAIL startup: DOM probe missing after ${TIMEOUT_SECONDS}s" >&2
	cat "$log" >&2 || true
	exit 1
fi
if ! grep -q '"appFound":true' "$log"; then
	echo "FAIL startup: #app missing" >&2
	cat "$log" >&2 || true
	exit 1
fi

end_ns="$(date +%s%N)"
awk -v start="$start_ns" -v end="$end_ns" -v binary="$BINARY" -v timeout="$TIMEOUT_SECONDS" '
	BEGIN {
		ms = (end - start) / 1000000
		printf "startup measurement: binary=%s timeout_seconds=%s startup_ms=%.0f startup_seconds=%.3f\n", binary, timeout, ms, ms / 1000
	}
'
grep 'Markpad DOM probe' "$log" | tail -1
