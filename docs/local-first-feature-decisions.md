# Local-First Feature Decisions

Updated: 2026-06-24

## Decision summary

| Area | Direction now | Defer |
| --- | --- | --- |
| Search | Rebuildable SQLite FTS5 sidecar over local files, merged with in-memory loaded buffers | Embeddings, bundled search daemons, trigram indexes by default |
| Tasks | Markdown task list items as source of truth, with visible metadata tokens | Calendar-grade VTODO sync, hidden IDs until line-hash identity is insufficient |
| Canvas | Markpad-owned versioned JSON canvas files | Bundling tldraw/Excalidraw/InfiniPaint as the primary engine before measurement |

## Search direction

Use a sidecar SQLite FTS5 database as a derived cache, not the source of truth.

SQLite FTS5 is designed for full-text search over document collections and supports `MATCH`, prefix indexes, external-content tables, and relevance ranking through `bm25()` / the hidden `rank` column. Markpad should keep user files authoritative and rebuild the index when needed.

Initial implementation constraints:

- Index Markdown/text files in bounded chunks.
- Keep unsaved loaded buffers in memory and merge them with FTS results.
- Stream indexing from disk; do not bridge full workspace contents into the WebView.
- Expose file count, skipped count, indexed bytes, elapsed time, DB path, and DB size in diagnostics.
- Keep the FTS DB rebuildable and safe to delete.
- Decide the Go SQLite driver only after a binary-size check. A pure-Go driver avoids CGO friction but may increase binary size; CGO drivers need platform packaging care.

Primary references:

- SQLite FTS5 docs: https://sqlite.org/fts5.html

## Task direction

Use Markdown task list items as the source of truth:

```md
- [ ] Write task due:2026-07-01 #project @context
- [x] Completed task
```

GFM defines task list items with `[ ]` and `[x]` markers. Todo.txt conventions are useful for portable metadata such as `due:YYYY-MM-DD`, `+project`, `#tag`, and `@context`, but Markpad should keep Markdown files as the primary task file format because users already edit Markdown.

Initial implementation constraints:

- Toggle tasks by path + line + original text hash, not line number alone.
- Leave metadata visible in the file rather than hidden in app-only storage.
- Keep any task index derived and rebuildable.
- Export to Todo.txt later, but do not make Todo.txt the primary internal model unless users ask for it.
- Defer RFC 5545 VTODO until calendar interoperability becomes a concrete phase.

Primary references:

- GitHub Flavored Markdown task list items: https://github.github.com/gfm/
- Todo.txt format and metadata convention: https://github.com/todotxt/todo.txt
- Todo.txt project summary: https://todotxt.org/

## Canvas direction

Use Markpad-owned versioned JSON files for canvas persistence first.

The current goal is a lightweight local infinite canvas, not a full whiteboard runtime. A small schema keeps binary size stable, keeps files readable/exportable, and lets Markpad add import/export adapters later.

Initial implementation constraints:

- Store canvas files as versioned JSON with `type`, `version`, `app`, `elements`, and viewport/session metadata.
- Keep embedded image assets external or separately capped; do not inline large blobs by default.
- Cache element bounds and schedule renders with `requestAnimationFrame` before adding heavier features.
- Add Excalidraw import/export later if users need interoperability.
- Treat tldraw as deferred because current SDK production use requires a license key.
- Treat InfiniPaint as inspiration only; its own docs warn image/GIF canvas content can use a lot of memory.

Primary references:

- Excalidraw JSON schema docs: https://docs.excalidraw.com/docs/codebase/json-schema
- Excalidraw `serializeAsJSON` utility: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils
- tldraw persistence docs: https://tldraw.dev/docs/persistence
- tldraw license docs: https://tldraw.dev/community/license
- InfiniPaint repository: https://github.com/ErrorAtLine0/infinipaint

## Phase order

1. Stabilize diagnostics and budgets.
2. Improve current UI readability and identity.
3. Add task rendering/paging and draft-trash byte caps.
4. Add FTS5 sidecar as an optional, rebuildable search cache.
5. Add canvas bounds caching and versioned JSON save/load.
6. Add import/export adapters only after measuring size and memory impact.
