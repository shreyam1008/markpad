# Architecture

Markpad is a Go desktop app built around three separable layers:

- `cmd/markpad`: process entry point and command-line file arguments.
- `internal/desktop`: Gio UI, menus, sidebar, editor, viewer, modals, and user actions.
- `internal/session`: session restore, drafts, bookmarks, preferences, and atomic file persistence.
- `internal/preview`: lightweight Markdown block parsing for native viewer layout.
- `internal/markdown`: goldmark-backed HTML rendering support for tests and future export/web work.

## Data flow

1. Startup creates a `session.Store` under the platform config directory.
2. The session JSON is loaded, then every document draft is restored from `drafts/`.
3. Opening a file reads plain text from disk, adds or activates a session document, writes a draft copy, and switches to Viewer mode.
4. Editing updates document metadata and schedules a draft flush.
5. Save writes atomically to the current file path. Save as writes atomically to the chosen path and updates the document path.
6. Exit flushes dirty drafts and saves session metadata.

## Persistence model

- Session metadata: `session.json`.
- Draft content: one file per document under `drafts/`.
- Saved files: regular user-chosen paths with any extension.
- Bookmarks: absolute, deduplicated file paths stored in the session.

## UI model

The UI intentionally follows a traditional desktop shape:

- File/View/Help menu bar above everything.
- Collapsible left sidebar with favorites/bookmarks first and session notes below.
- Center mode switch with only Markdown and Viewer.
- Save and Cancel changes on the right side of the note toolbar.
- Help, Tour, About, Settings, and Save as are in-app modal overlays.

## Performance notes

Current preview parsing is cached per note and only recalculates when content changes. Draft writes are throttled during editing and forced on close.

The large-file roadmap is to replace the full-string editor model with a rope or piece-table, add incremental preview parsing, and benchmark 1 MB to 100 MB Markdown files.
