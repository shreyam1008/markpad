# Markpad local search roadmap

Markpad search should stay local-first, fast, and memory-bounded.

## Phase 1: in-process bounded search

Use the current in-process scan path for loaded notes and local folders.

Requirements:

- Keep canonical content in user-owned files, not a hidden search database.
- Preserve result caps, file-size skips, and stale-search cancellation.
- Mark superseded folder scans in result metadata so UI/export copy can report dropped stale searches truthfully.
- Rank exact title/path matches above body matches.
- Return clear result metadata: source, path/title, line, snippet, and skipped/limited status.
- Avoid retaining full-folder indexes or whole-file bodies after a query completes.
- Keep UI rendering capped so search results cannot create an unbounded DOM.

This phase improves perceived quality without adding runtime services, dependencies, or release-binary weight.

## Phase 2: optional derived index

If profiling proves scan latency is too high for large folders, add a derived SQLite FTS5 sidecar index.

Constraints:

- Treat the index as disposable cache, never as canonical content.
- Prefer external-content FTS5 tables so the index does not duplicate full document text.
- Add rebuild and integrity-check flows because external-content indexes must stay consistent with the source table.
- Consider the trigram tokenizer only for substring search needs; it trades index size for more flexible matching.
- Do not add a SQLite driver directly to production code until a branch-local budget probe records binary-size, startup, and PSS deltas against the current Wails build.
- Keep the probe reversible: build once with the candidate driver, run `make budget`, `make smoke-desktop`, and `make memory`, then discard or commit only if it stays inside the release budget.
- Bias toward pure-Go/cgo-free candidates for packaging simplicity, but reject any candidate that pushes Markpad over the binary or memory budget.
- Keep sync/cloud work out of the search index design until the local path is stable.

Measured driver probes on 2026-06-24 against a `9,950,088` byte stripped Wails baseline:

- `modernc.org/sqlite v1.53.0` with a tagged blank-import probe built to `13,699,432` bytes, a `+3,749,344` byte delta. Reject for the current 10 MiB binary budget.
- `github.com/mattn/go-sqlite3 v1.14.47` with `CGO_ENABLED=1` and `sqlite_fts5` built to `11,801,912` bytes, a `+1,851,824` byte delta. Reject for the current 10 MiB binary budget and keep as higher-packaging-risk fallback only if the cap changes.
- Phase 2 search should therefore continue with the current bounded in-process search, or use an external optional helper/index process later rather than linking SQLite into the main binary.

Primary references:

- SQLite FTS5 supports external-content tables and documents the consistency responsibility, rebuild path, and trigram tokenizer behavior at https://sqlite.org/fts5.html.
- The pure-Go `modernc.org/sqlite` driver is a candidate only after measurement: https://pkg.go.dev/modernc.org/sqlite.
