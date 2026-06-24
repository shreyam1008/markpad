# Search index sidecar plan

Markpad search should stay local-first and low-memory. The stronger search path is a rebuildable SQLite FTS5 sidecar, not a hidden document database.

## Goals

- Search across the configured local folder without loading the whole workspace into the webview.
- Keep user files as the source of truth.
- Keep the index disposable and rebuildable.
- Keep future sync clean by never syncing search indexes.
- Preserve current loaded-file search for instant in-session results.

## Non-goals for phase 1

- No cloud search.
- No semantic/vector index.
- No background process that keeps large file contents resident.
- No migration that stores notes only in SQLite.

## Proposed files

- App cache database: `markpad-search.sqlite`
- Tables:
  - `documents`: path, relative path, title, kind, size, mtime, content hash, indexed time.
  - `documents_fts`: FTS5 index for title, path, and extracted text.
  - `index_meta`: schema version and last full rebuild time.

The database lives in app cache or app data. Deleting it must not lose user work.

## Indexing behavior

- Initial scan: walk the configured local folder with the existing local-folder limits.
- Incremental scan: compare size and modified time first; hash only changed candidates.
- Content extraction: index lightweight editable types first: Markdown, text, code, JSON, and config.
- Binary/read-only files: index filename, path, type, and available metadata only.
- Deletions: remove records for paths no longer present.
- Limits: cap per-file extracted text and skip very large files unless explicitly opened.

## Query behavior

- Keep the current loaded-file search path for active/open notes.
- Use FTS5 for local-folder search when the sidecar is ready.
- Merge results by source:
  - Loaded/open note hits first when actively editing.
  - FTS local hits next with path, title, snippet, kind, size, mtime.
- Apply advanced filters consistently:
  - `type:`
  - `path:`
  - `title:`
  - `tag:`
  - `task:open`
  - `task:done`
  - exclusions with `-`

## Memory rules

- Do not send full indexed content to the frontend.
- Return paged results with snippets.
- Keep only the current result page and query metadata in JS memory.
- Report index size and row count in Local Footprint.

## Failure behavior

- If the database is missing, create it lazily.
- If the database is corrupt, delete and rebuild after user-visible status.
- If FTS5 is unavailable in the SQLite build, fall back to current bounded folder scan.
- If indexing fails on one file, record the failure and continue.

## UI affordances

- Search popover should show index state: cold, indexing, ready, stale, fallback.
- Search popover should show parsed query chips for terms, phrases, filters, exclusions, wildcards, and fuzzy terms.
- Local Footprint should show index database bytes and row count.
- Search Profile should show query operators, result sources, loaded-search cache bytes, bridge availability, and sidecar state.
- Local Folder panel should offer:
  - Rebuild search index.
  - Pause indexing.
  - Clear search index.
- Search results should explain when they are loaded-only, local-indexed, or fallback-scanned.

## Commit sequence

1. Add backend cache path and empty schema creation.
2. Add bounded file extractor and document fingerprinting.
3. Add incremental indexer with manual rebuild command.
4. Add FTS query endpoint returning paged snippets.
5. Extend Search Profile with sidecar state, row count, database bytes, and last-indexed timestamp.
6. Wire frontend search to use index when ready and fallback when not.
7. Add Local Footprint index bytes and row counts.
8. Add rebuild/clear controls in Local Folder and Search help.
