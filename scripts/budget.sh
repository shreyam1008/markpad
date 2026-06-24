#!/bin/sh
set -eu

ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)

BINARY=${MARKPAD_BUDGET_BINARY:-"$ROOT/dist/markpad"}
MAIN_JS=${MARKPAD_BUDGET_MAIN_JS:-"$ROOT/frontend/src/main.js"}

BINARY_MAX_BYTES=${MARKPAD_BUDGET_BINARY_MAX_BYTES:-10485760}
MAIN_JS_WARN_BYTES=${MARKPAD_BUDGET_MAIN_JS_WARN_BYTES:-819200}
MAIN_JS_MAX_BYTES=${MARKPAD_BUDGET_MAIN_JS_MAX_BYTES:-921600}

status=0

bytes() {
	wc -c < "$1" | tr -d '[:space:]'
}

human() {
	awk -v bytes="$1" 'BEGIN {
		if (bytes >= 1048576) {
			printf "%.2f MiB", bytes / 1048576
		} else {
			printf "%.1f KiB", bytes / 1024
		}
	}'
}

relative() {
	case "$1" in
		"$ROOT"/*) printf "%s" "${1#$ROOT/}" ;;
		*) printf "%s" "$1" ;;
	esac
}

echo "Budget check"

if [ ! -f "$BINARY" ]; then
	echo "FAIL binary $(relative "$BINARY"): missing; run make build or set MARKPAD_BUDGET_BINARY"
	status=1
else
	binary_bytes=$(bytes "$BINARY")
	if [ "$binary_bytes" -gt "$BINARY_MAX_BYTES" ]; then
		echo "FAIL binary $(relative "$BINARY"): $(human "$binary_bytes") ($binary_bytes bytes), max $(human "$BINARY_MAX_BYTES") ($BINARY_MAX_BYTES bytes)"
		status=1
	else
		echo "OK   binary $(relative "$BINARY"): $(human "$binary_bytes") ($binary_bytes bytes), max $(human "$BINARY_MAX_BYTES") ($BINARY_MAX_BYTES bytes)"
	fi
fi

if [ ! -f "$MAIN_JS" ]; then
	echo "FAIL frontend $(relative "$MAIN_JS"): missing"
	status=1
else
	main_js_bytes=$(bytes "$MAIN_JS")
	if [ "$main_js_bytes" -gt "$MAIN_JS_MAX_BYTES" ]; then
		echo "FAIL frontend $(relative "$MAIN_JS"): $(human "$main_js_bytes") ($main_js_bytes bytes), max $(human "$MAIN_JS_MAX_BYTES") ($MAIN_JS_MAX_BYTES bytes)"
		status=1
	elif [ "$main_js_bytes" -gt "$MAIN_JS_WARN_BYTES" ]; then
		echo "WARN frontend $(relative "$MAIN_JS"): $(human "$main_js_bytes") ($main_js_bytes bytes), warn $(human "$MAIN_JS_WARN_BYTES") ($MAIN_JS_WARN_BYTES bytes), max $(human "$MAIN_JS_MAX_BYTES") ($MAIN_JS_MAX_BYTES bytes)"
	else
		echo "OK   frontend $(relative "$MAIN_JS"): $(human "$main_js_bytes") ($main_js_bytes bytes), warn $(human "$MAIN_JS_WARN_BYTES") ($MAIN_JS_WARN_BYTES bytes), max $(human "$MAIN_JS_MAX_BYTES") ($MAIN_JS_MAX_BYTES bytes)"
	fi
fi

exit "$status"
