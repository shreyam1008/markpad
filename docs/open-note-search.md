# Open-note content search

`Ctrl+F` finds text in the current note. Enter and Shift+Enter move forward and
backward with wrap-around; typing a query keeps focus in the query field. Source
matches are revealed in Editor, including Windows CRLF files and Unicode text.
Task boards retain their existing in-place filter in Preview.

`Ctrl+Shift+F` and the title-bar Search button open a 430px overlay inspector.
Results group by note, with short highlighted snippets and one-based source line
and column numbers. Arrow keys select a result; Enter or a click opens Editor and
selects the exact source match. Closing the inspector restores its opener's focus.
The document layout does not resize. See [light](images/open-note-search/light.png),
[dark](images/open-note-search/dark.png), and [narrow](images/open-note-search/narrow.png)
native Windows screenshots.

Only currently open text notes and drafts participate. The active note comes
directly from the live editor buffer; other notes come from the desktop's existing
open-document API, which includes recovery drafts. Search does not save user
files, open recents, scan folders, or retain an index after the inspector closes.

Exact case-insensitive literal matches come first. **Allow one typo** is opt-in:
one insertion, deletion, substitution, or adjacent transposition in a single word
of 4–64 Unicode characters. Near matches are visibly labeled. Queries are bounded
to 256 UTF-16 code units, results to 300, and the inspector's temporary source
snapshot to 16 Mi UTF-16 code units. Omitted notes, unreadable notes, and additional
matches have explicit notices. Search scans 32KiB windows, yields after about 8ms,
and cancels superseded requests. Result selection validates current source again
before revealing it, so stale positions cannot select unrelated text.

## Engine choice and measurements

No dependency, daemon, bundled executable, or persistent index was added.
The existing webview JavaScript engine performs literal matching over live buffers;
a small bounded helper handles snippets, source locations, and one-typo matching.

[ripgrep](https://github.com/BurntSushi/ripgrep#quick-examples-comparing-tools)
is a strong disk/regex search tool, but its maintainers explicitly caution that a
single benchmark cannot establish a universally fastest tool.
[ugrep](https://github.com/Genivia/ugrep#fuzzy-search-with--z) provides edit-distance
fuzzy search, while [fzf](https://github.com/junegunn/fzf#usage) selects entries from
an input list. Passing open buffers to a native process adds encoding, launch,
decoding, note-identity, and UTF-16 mapping work. Writing unsaved text to temporary
files just to search it would add persistence and cleanup work without helping
this workload.

Synthetic warm-buffer measurements on Windows, 2 October 2026, in the actual
Wails WebView2 renderer (Edge 154.0.4258.48, V8 15.4.11.6), with five warmups:

| Workload | Samples | Median | p95 |
|---|---:|---:|---:|
| 20 × 32KiB notes, sparse exact | 30 | 0.9ms | 1.1ms |
| Same, no exact match | 30 | 0.8ms | 0.9ms |
| Same, one-typo search | 30 | 1.2ms | 1.4ms |
| Same, fuzzy no match | 30 | 3.5ms | 4.5ms |
| 8 × 2MB notes, no exact match | 10 | 31.3ms | 40.8ms |
| Same, fuzzy no match | 10 | 177.5ms | 210ms |

These measure matching, snippets, locations, and cooperative event-loop yields;
they exclude desktop reads, the UI's 80ms query debounce, layout, and cold startup.
Common matches stop at the result cap. A cooperative abort was observed in the
native renderer. On the same Windows host, ripgrep 15.2.0 over stdin, including
process launch, encoding and JSON decoding, took a median 26.15ms (p95 31.87ms)
for the sparse 640KiB fixture. That comparison supports avoiding a process boundary
here; it is not a Linux disk-search ranking. The complete native helper measurement
is retained in [the benchmark evidence](open-note-search-benchmark.json).

Reproduce the cross-runtime benchmark with
`bun .github/scripts/benchmark-content-search.ts`; set `SEARCH_BENCH_RG=none` to
omit the optional CLI comparison. For native Windows, build the isolated profiling
executable with `.github/scripts/build-performance-windows.py`, then run
`.github/scripts/smoke-search-windows.mjs` with Bun. Its optional third argument
accepts an isolated browser bundle of `content-search.ts` for renderer measurements.
Profiling instrumentation is confined to a private dependency copy and never
ships in the production application.

## Verification

Unit and DOM coverage checks literal/Unicode/CRLF offsets, chunk boundaries,
snippets, all four typo operations, exact-first grouping, keyboard/focus behavior,
live drafts, stale/cancelled loads, unreadable notes, and memory/result limits.
The native Windows smoke exercises actual Ctrl+F/Ctrl+Shift+F, unsaved edits and
drafts, distant source selection/scrolling, CRLF+emoji Markdown and CodeMirror,
native menu edit isolation, light/dark/narrow layout, and offline operation.

The Windows production build remains version 0.14.4 and measures 18,881,536 bytes.
Embedded assets measure 1,264,692 bytes for the app JavaScript, 158,098 for CSS,
5,365,297 for the existing offline diagram script, 1,366 for HTML, and 611 for the
product SVG. Production `--version`, synchronized metadata, and the offline asset
scan pass. Go formatting was checked after normalizing checkout CRLF to LF, without
changing unrelated source files.

The existing Ubuntu 24.04 on-change CI runs `make check` and now also searches two
notes in GTK/WebKit, selects exact source through the native clipboard, searches
an unsaved edit and draft, and checks opt-in typo tolerance. Its screenshots and
OCR outputs are uploaded as CI evidence. Exact tested commit and CI outcome belong
in the pull request; a pre-existing green run is not evidence for this change.
No release tag, store submission, or public distribution update is part of this
source change.
