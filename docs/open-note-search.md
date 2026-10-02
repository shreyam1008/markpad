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
directly from the live editor buffer; other notes come from a bounded, paginated
native read API that prefers recovery drafts. Search does not save user
files, open recents, scan folders, or retain an index after the inspector closes.

Exact case-insensitive literal matches come first. **Allow one typo** is opt-in:
one insertion, deletion, substitution, or adjacent transposition in a single word
of 4–64 Unicode characters. Near matches are visibly labeled. Queries are bounded
to 256 UTF-16 code units, results to 300, and the inspector's temporary source
snapshot to 16 Mi UTF-16 code units. Omitted notes, unreadable notes, and additional
matches have explicit notices. Exact search scans 32 Ki-unit windows; typo scans
use 4 Ki-unit windows, yield after about 8ms, and cancel superseded requests.
Highlights show the entire searched span. Result selection validates current source again
before revealing it, so stale positions cannot select unrelated text.

## Engine choice and measurements

No dependency, daemon, bundled executable, or persistent index was added.
The existing webview JavaScript engine performs literal matching over live buffers;
a bounded helper handles snippets, lazy source locations, and one-typo matching.
Allocation-light ASCII tokenization retains the Unicode fallback. The native
bridge emits at most 1 Mi UTF-16 units and examines 128 IDs per page. Large
accepted notes span pages; incomplete or changed notes are never searched. A
note that exceeds the remaining scope budget is omitted, and later smaller notes
still qualify. No giant draft is read into memory simply to discover it is too big.

See [the scaling experiment](search-scalability.md) for native small-to-large,
1,000-file, CPU, memory, retention and responsiveness evidence, highlights,
library/tool comparisons, and reproduction. Warm matching excludes native reads,
the UI's 80ms query debounce and layout; actual panel timings include them. Native
Windows measurements and separate Node/V8 library comparisons remain distinct.
The [initial benchmark](open-note-search-benchmark.json) is retained as historical
evidence for the original search implementation, not the optimized build.

Reproduce the cross-runtime benchmark with
`bun .github/scripts/benchmark-content-search.ts`; set `SEARCH_BENCH_RG=none` to
omit the optional CLI comparison. For native Windows, build the isolated profiling
executable with `.github/scripts/build-performance-windows.py`, then run
`.github/scripts/smoke-search-windows.mjs` with Bun. Its optional third argument
accepts an isolated browser bundle of `content-search.ts` for renderer measurements.
Profiling instrumentation is confined to a private dependency copy and never
ships in the production application.

## Verification

Unit and DOM coverage checks literal/Unicode/CRLF offsets, scan and transfer boundaries,
snippets, all four typo operations, exact-first grouping, keyboard/focus behavior,
live drafts, stale/cancelled loads, unreadable notes, full highlights, fragmented
large notes, changed partial reads, and memory/result limits. Go tests verify
whole-note UTF-16 admission, bounded native pages, invalid UTF-8 replacement,
recovery precedence and unchanged source/recovery files.
The native Windows smoke exercises actual Ctrl+F/Ctrl+Shift+F, unsaved edits and
drafts, distant source selection/scrolling, CRLF+emoji Markdown and CodeMirror,
native menu edit isolation, light/dark/narrow layout, and offline operation.

The Windows production version and build identity are derived from synchronized
release metadata and the actual executable; current sizes and hashes are recorded
in the scaling evidence and pull request. Production `--version`, synchronized
metadata, and the offline asset scan are checked. Go formatting is checked after
normalizing checkout CRLF to LF, without changing unrelated source files.

The existing Ubuntu 24.04 on-change CI runs `make check` and now also searches two
notes in GTK/WebKit, selects exact source through the native clipboard, searches
an unsaved edit and draft, and checks opt-in typo tolerance. Its screenshots and
OCR outputs are uploaded as CI evidence. Exact tested commit and CI outcome belong
in the pull request; a pre-existing green run is not evidence for this change.
No release tag, store submission, or public distribution update is part of this
source change.
