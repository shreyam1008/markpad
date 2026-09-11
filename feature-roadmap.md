# Quillpane feature roadmap

Updated for v0.13.4 on 2026-09-11. Preview copy now uses the native clipboard; Help offers release checks and guided downloads. In-app automatic installation remains future work. GitHub issues are the live cards; this document explains why they are ordered this way.

## Stable baseline — v0.13.3

Quillpane (formerly Markpad) is a local Markdown notepad with an optional single-folder workspace:

- Plain local files plus autosaved recovery drafts and bounded saved-version history.
- Editor, Split, Preview/Code View, incremental CodeMirror source editing, image preview, and operating-system PDF handoff.
- Modern GFM, safe lazy Mermaid diagrams, and relative Markdown images resolved beside saved notes through a bounded native reader.
- `Ctrl+P` fuzzy navigation and bounded `Ctrl+Shift+F` folder search without a persistent index.
- A strict semantic design system, custom Wails chrome, system/light/dark modes, five color themes, and one live keyboard catalog.
- External-change protection, confirmed disk deletion, and collision-safe filing of instant drafts into ordinary workspace files.

Workspace data remains plain files. Quillpane does not import content, write metadata into the selected folder, create a search database, or require an account.

## Product rules

1. Plain local files remain the source of truth.
2. Typing, switching, preview, and search stay responsive under explicit bounds.
3. Unsaved content is never silently discarded or overwritten.
4. New capabilities reuse the normal document lifecycle instead of creating parallel storage.
5. The app stays offline, account-free, and within the platform release ceilings.
6. Every feature ships with empty, failure, reopen, keyboard, and narrow-window behavior.
7. No new embedded runtime dependency lands until Windows amd64 regains at least 256 KiB of bundle headroom.

## Now — v0.14.0

### [#1 Focus mode: distraction-free writing](https://github.com/shreyam1008/markpad/issues/1)

Hide chrome without remounting the document, losing cursor state, or creating a second shell. This takes the useful core of ZenNotes' Zen mode and keeps it a reversible presentation state.

### [#2 Bounded source/preview scroll synchronization](https://github.com/shreyam1008/markpad/issues/2)

Keep Split view near the same Markdown block using headings and block anchors. It must avoid feedback loops, continuous full-document measurement, and jitter around images, tables, fences, or Mermaid diagrams.

### [#3 Performance baseline and bundle-headroom recovery](https://github.com/shreyam1008/markpad/issues/3)

Restore at least 256 KiB below the Windows ceiling and publish repeatable cold/warm startup, private-memory/PSS, typing, preview, and representative folder-search measurements.

## Next — plain-file workflows

### [#4 Workspace task list](https://github.com/shreyam1008/markpad/issues/4)

Derive unchecked tasks from ordinary Markdown checkbox lines on demand. Selecting or toggling a task routes through the exact file location and normal conflict-safe save path. This is a list, not a Kanban database.

### [#5 Daily note quick open](https://github.com/shreyam1008/markpad/issues/5)

Open or create `YYYY-MM-DD.md` in a chosen workspace subfolder through the existing collision-safe file lifecycle. No scheduler, daemon, template marketplace, or hidden metadata.

## Explore — prove before promotion

### [#6 Pinned reference note](https://github.com/shreyam1008/markpad/issues/6)

Prototype one read-only reference beside the active document. Promotion requires stable geometry, keyboard focus, narrow-window fallback, session restore, and measured memory cost.

### Other candidates

- Refresh-on-focus after manual refresh behavior is measured.
- Bounded local HTML/PDF export.
- Signed/notarized macOS artifacts and verified store packages.
- Optional slash insertion only if it is faster than the existing toolbar and command palette.
- Wikilink navigation only after plain relative Markdown links are excellent; backlinks remain deferred without an on-demand bounded design.

## Ideas deliberately outside Quillpane's near-term scope

ZenNotes also demonstrates math engines, a CLI, MCP, sync, cloud backup/publishing, mobile clients, comments, backlinks, and a full vault model. Those are useful references, not automatic requirements. Quillpane will not add:

- Cloud sync, accounts, collaboration, publishing, or telemetry.
- A persistent full-text index or proprietary database.
- Background daemons or file watchers before on-focus refresh is justified.
- TikZ/JSXGraph/function-plot runtimes, an MCP server, or a bundled CLI while the binary has effectively no headroom.
- Multiple simultaneous workspaces, graph views, databases, canvas, or automatic bulk deletion.

## Release policy

Before moving a card to shipped:

1. Meet the linked issue's acceptance criteria.
2. Run focused tests plus `make check` from frozen dependencies.
3. Exercise the native Windows/Linux/macOS flow that changed, including failure and reopen behavior.
4. Measure bundle and memory impact and update `BUNDLE_BUDGET.md`.
5. Update behavior, architecture, changelog, website, screenshots, and package metadata where relevant.

Inspiration reference: [ZenNotes](https://zennotes.org/) keeps notes as plain Markdown and exposes keyboard-first focus, tasks, daily notes, references, and navigation. Quillpane borrows only the slices that preserve its smaller local-notepad contract.
