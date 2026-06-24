#!/bin/sh
set -eu

BINARY="${MARKPAD_MEMORY_BINARY:-dist/markpad}"
RUNS="${RUNS:-1}"
SAMPLE_SECONDS="${SAMPLE_SECONDS:-5}"
BOOT_TIMEOUT_SECONDS="${MARKPAD_MEMORY_BOOT_TIMEOUT_SECONDS:-10}"

positive_int() {
	name="$1"
	value="$2"
	case "$value" in
		''|*[!0-9]*)
			echo "FAIL memory: $name must be a positive integer" >&2
			exit 1
			;;
	esac
	if [ "$value" -lt 1 ]; then
		echo "FAIL memory: $name must be a positive integer" >&2
		exit 1
	fi
}

positive_int RUNS "$RUNS"
positive_int SAMPLE_SECONDS "$SAMPLE_SECONDS"
positive_int MARKPAD_MEMORY_BOOT_TIMEOUT_SECONDS "$BOOT_TIMEOUT_SECONDS"

if [ ! -x "$BINARY" ]; then
	echo "FAIL memory: missing executable $BINARY" >&2
	exit 1
fi

if [ ! -r /proc/$$/smaps_rollup ]; then
	echo "FAIL memory: /proc/*/smaps_rollup is not readable on this system" >&2
	exit 1
fi

if ! command -v pgrep >/dev/null 2>&1; then
	echo "FAIL memory: pgrep is required" >&2
	exit 1
fi

tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/markpad-memory.XXXXXX")"
current_pid=""

all_pids() {
	root="$1"
	[ -d "/proc/$root" ] || return 0
	printf "%s\n" "$root"
	for child in $(pgrep -P "$root" 2>/dev/null || true); do
		all_pids "$child"
	done
}

kill_tree() {
	root="$1"
	pids="$(all_pids "$root" | awk '!seen[$0]++' | tr '\n' ' ')"
	[ -n "$pids" ] && kill -TERM $pids 2>/dev/null || true
	sleep 1
	[ -n "$pids" ] && kill -KILL $pids 2>/dev/null || true
}

cleanup() {
	if [ -n "${current_pid:-}" ]; then
		kill_tree "$current_pid"
	fi
	rm -rf "$tmp_root"
}
trap cleanup EXIT INT TERM

log_has() {
	pattern="$1"
	file="$2"
	awk -v pattern="$pattern" 'index($0, pattern) { found = 1; exit } END { exit found ? 0 : 1 }' "$file" 2>/dev/null
}

log_matches() {
	pattern="$1"
	file="$2"
	awk -v pattern="$pattern" '$0 ~ pattern { found = 1; exit } END { exit found ? 0 : 1 }' "$file" 2>/dev/null
}

last_dom_probe() {
	file="$1"
	awk '/Markpad DOM probe/ { line = $0 } END { if (line != "") print line }' "$file" 2>/dev/null
}

sum_tree_kb() {
	root="$1"
	all_pids "$root" | awk '!seen[$0]++' | while IFS= read -r proc_pid; do
		rollup="/proc/$proc_pid/smaps_rollup"
		[ -r "$rollup" ] || continue
		awk -v proc_pid="$proc_pid" '
			$1 == "Rss:" { rss = $2 }
			$1 == "Pss:" { pss = $2 }
			END {
				if (rss || pss) {
					printf "%s %d %d\n", proc_pid, rss, pss
				}
			}
		' "$rollup" 2>/dev/null || true
	done | awk '{ count++; rss += $2; pss += $3 } END { printf "%d %d %d\n", count + 0, rss + 0, pss + 0 }'
}

print_sample() {
	run="$1"
	sample="$2"
	pids="$3"
	rss_kib="$4"
	pss_kib="$5"
	awk -v run="$run" -v sample="$sample" -v pids="$pids" -v rss="$rss_kib" -v pss="$pss_kib" '
		BEGIN {
			printf "run=%d sample=%d pids=%d rss_kib=%d pss_kib=%d rss_mib=%.1f pss_mib=%.1f\n",
				run, sample, pids, rss, pss, rss / 1024, pss / 1024
		}
	'
}

print_summary() {
	run="$1"
	samples="$2"
	total_rss="$3"
	total_pss="$4"
	max_rss="$5"
	max_pss="$6"
	awk -v run="$run" -v samples="$samples" -v total_rss="$total_rss" -v total_pss="$total_pss" -v max_rss="$max_rss" -v max_pss="$max_pss" '
		BEGIN {
			printf "run=%d summary samples=%d avg_rss_mib=%.1f avg_pss_mib=%.1f max_rss_mib=%.1f max_pss_mib=%.1f\n",
				run, samples, total_rss / samples / 1024, total_pss / samples / 1024, max_rss / 1024, max_pss / 1024
		}
	'
}

echo "memory measurement: binary=$BINARY runs=$RUNS sample_seconds=$SAMPLE_SECONDS"

run=1
overall_samples=0
overall_rss=0
overall_pss=0
overall_max_rss=0
overall_max_pss=0

while [ "$run" -le "$RUNS" ]; do
	run_dir="$tmp_root/run-$run"
	mkdir -p "$run_dir/home" "$run_dir/xdg-config" "$run_dir/xdg-cache" "$run_dir/xdg-data"
	log="$run_dir/markpad.log"

	HOME="$run_dir/home" \
	XDG_CONFIG_HOME="$run_dir/xdg-config" \
	XDG_CACHE_HOME="$run_dir/xdg-cache" \
	XDG_DATA_HOME="$run_dir/xdg-data" \
	MARKPAD_DEBUG_BOOT=1 \
	"$BINARY" >"$log" 2>&1 &
	current_pid=$!

	elapsed=0
	while [ "$elapsed" -lt "$BOOT_TIMEOUT_SECONDS" ]; do
		if ! kill -0 "$current_pid" 2>/dev/null; then
			echo "FAIL memory: app exited before DOM probe in run $run" >&2
			cat "$log" >&2 || true
			exit 1
		fi
		if log_has "Markpad DOM probe" "$log"; then
			break
		fi
		sleep 1
		elapsed=$((elapsed + 1))
	done

	if ! log_has "Markpad DOM probe" "$log"; then
		echo "FAIL memory: DOM probe missing after ${BOOT_TIMEOUT_SECONDS}s in run $run" >&2
		cat "$log" >&2 || true
		exit 1
	fi
	if ! log_has '"appFound":true' "$log"; then
		echo "FAIL memory: #app missing in DOM probe for run $run" >&2
		cat "$log" >&2 || true
		exit 1
	fi
	if ! log_matches '"appRect":\{"width":[1-9][0-9]*,"height":[1-9][0-9]*\}' "$log"; then
		echo "FAIL memory: #app has no rendered size in run $run" >&2
		cat "$log" >&2 || true
		exit 1
	fi

	echo "run=$run dom_probe=$(last_dom_probe "$log")"

	sample=1
	run_samples=0
	run_rss=0
	run_pss=0
	run_max_rss=0
	run_max_pss=0

	while [ "$sample" -le "$SAMPLE_SECONDS" ]; do
		if ! kill -0 "$current_pid" 2>/dev/null; then
			echo "FAIL memory: app exited during sampling in run $run" >&2
			cat "$log" >&2 || true
			exit 1
		fi

		set -- $(sum_tree_kb "$current_pid")
		pid_count="$1"
		rss_kib="$2"
		pss_kib="$3"

		if [ "$pid_count" -lt 1 ]; then
			echo "FAIL memory: no readable smaps_rollup files in process tree for run $run" >&2
			exit 1
		fi

		print_sample "$run" "$sample" "$pid_count" "$rss_kib" "$pss_kib"

		run_samples=$((run_samples + 1))
		run_rss=$((run_rss + rss_kib))
		run_pss=$((run_pss + pss_kib))
		overall_samples=$((overall_samples + 1))
		overall_rss=$((overall_rss + rss_kib))
		overall_pss=$((overall_pss + pss_kib))

		[ "$rss_kib" -gt "$run_max_rss" ] && run_max_rss="$rss_kib"
		[ "$pss_kib" -gt "$run_max_pss" ] && run_max_pss="$pss_kib"
		[ "$rss_kib" -gt "$overall_max_rss" ] && overall_max_rss="$rss_kib"
		[ "$pss_kib" -gt "$overall_max_pss" ] && overall_max_pss="$pss_kib"

		if [ "$sample" -lt "$SAMPLE_SECONDS" ]; then
			sleep 1
		fi
		sample=$((sample + 1))
	done

	print_summary "$run" "$run_samples" "$run_rss" "$run_pss" "$run_max_rss" "$run_max_pss"
	kill_tree "$current_pid"
	current_pid=""
	run=$((run + 1))
done

print_summary 0 "$overall_samples" "$overall_rss" "$overall_pss" "$overall_max_rss" "$overall_max_pss" |
	awk '{ sub(/^run=0 summary/, "overall summary"); print }'
