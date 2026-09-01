# Post-v0.11 feature roadmap

## Stable baseline

Markpad v0.11.0 is a local Markdown notepad with a small optional folder workspace. It includes:

- React 19 and strict TypeScript components bundled with Bun.
- Ordinary local files plus autosaved recovery drafts and bounded saved-version history.
- Editor, Split, Preview/Code View, image preview, and operating-system PDF handoff.
- `Ctrl+P` fuzzy navigation across open files, workspace relative paths, and stable actions.
- Workspace Lite: one persisted folder, bounded deterministic scan, manual refresh/change/clear, and safe Markdown/text creation.
- `Ctrl+Shift+F` case-insensitive exact content search with relative path, line, snippet, and exact match selection.
- Permanent saved-file deletion only after a warning that covers both the disk file and any unsaved edits, with backend path-safety checks.

Workspace data remains plain files. Markpad does not import content, write metadata into the selected folder, or create a search database.

## Product rules

1. Plain local files remain the source of truth.
2. Typing, switching, and search must stay responsive under documented bounds.
3. Unsaved content is never silently discarded or overwritten.
4. New capabilities reuse the normal document lifecycle instead of creating parallel storage.
5. Keep the app offline, account-free, and below the 16 MiB release ceiling.
6. Ship one cohesive user outcome at a time, with failure and reopen behavior covered.

## Implemented: external-change protection

Status: IMPLEMENTED, release pending

### User value

Avoid overwriting changes made by another editor after a file was opened in Markpad.

### Smallest useful slice

- Persist a SHA-256 content fingerprint plus useful source metadata after open/save.
- Stream-hash and identity-check the current path immediately before a normal save.
- Offer explicit keep-editing, save-a-copy, reload, overwrite, or recreate choices while preserving the current draft.
- Preserve the draft in Version History before reload and refresh workspace metadata after resolution.

### Acceptance criteria

- A changed file is never overwritten without a visible choice.
- Reload cannot discard the Markpad draft silently.
- Atomic replacement, deletion, and rename are distinguished from an ordinary unchanged save.
- Behavior is covered by focused filesystem tests.

## Implemented: file a draft in Workspace Lite

Status: IMPLEMENTED, release pending

### User value

Keep capture as fast as an unsaved notepad while removing the file-dialog friction when that thought becomes part of the chosen workspace.

### Shipped slice

- Suggest a bounded, readable Markdown/text filename from the first useful draft line.
- Avoid case-insensitive suggestion collisions and let the user edit a nested relative path.
- Reserve the backend path with no-overwrite semantics, then promote the same recovery document into the workspace.
- Refresh the inventory and preserve the saved document across reopen.
- Expose the workflow through a visible control, the command palette, the native File menu, and `Ctrl+Shift+Enter`.

## Later, only after the baseline is proven

- OS-aware dark mode with one polished dark palette.
- Refresh-on-focus, if manual workspace refresh proves insufficient.
- Source/preview scroll synchronization.
- HTML/PDF export using a deliberately bounded local path.
- Signed/notarized macOS artifacts and store publication.
- Repeatable cold-start, memory, typing-latency, and workspace-search benchmarks.

## Explicitly deferred vault features

These are not part of Workspace Lite and should not be bundled into maintenance work:

- Persistent full-text indexing or a database.
- Multiple simultaneous workspaces.
- File watchers/daemons before refresh-on-focus is justified.
- Wikilinks, backlinks, graph views, databases, canvas, or Git integration.
- Task boards, daily-note generators, template marketplaces, sync, collaboration, AI, MCP, accounts, or cloud services.
- Automatic bulk deletion or hidden retention policies.

## Release policy

Before calling a feature shipped:

1. Run its focused tests.
2. Run `make check` from installed frozen dependencies.
3. Exercise its main native flow with a clean profile and reopen the app.
4. Verify persisted and failure states.
5. Update behavior, architecture, release notes, and bundle limits where relevant.
