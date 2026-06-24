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
- Keep sync/cloud work out of the search index design until the local path is stable.

Primary reference: SQLite FTS5 supports external-content tables and documents the consistency responsibility, rebuild path, and trigram tokenizer behavior at https://sqlite.org/fts5.html.
