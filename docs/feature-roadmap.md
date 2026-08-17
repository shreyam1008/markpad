# Post-v0.9 feature roadmap

## Purpose

Markpad became difficult to reason about after many small additions landed without cohesive feature boundaries. This document keeps future work aligned with the deliberately small v0.9 product.

This is not a promise to restore every experiment. It is a controlled backlog for reintroducing only the features that make Markpad simpler or more useful.

## Stable baseline

The source-of-truth baseline is the root Markpad application:

- Release: v0.9.2
- Runtime: Go, Wails v2, and the operating-system webview
- Frontend: typed DOM modules bundled with Bun; no component framework
- Product identity: a small local Markdown notepad, not a full workspace platform

The baseline already includes the product essentials:

- Open, edit, save, and save-as for local text and Markdown files.
- Autosaved drafts and session restoration.
- Recent files and favorites.
- Editor, preview, and split modes.
- Markdown formatting toolbar.
- Version history and restore.
- Find, zoom, scroll-position memory, and document outline.
- Syntax-aware code viewing.
- Read-only handling for PDFs, images, and other document types.
- Native menus, file dialogs, drag and drop, and single-instance behavior.
- Linux, Windows, and macOS release packaging.

## Product rules

Every future feature must satisfy these rules:

1. Plain files remain the source of truth.
2. A feature gets one obvious entry point before it gets shortcuts or variants.
3. A feature is not complete until save, reopen, failure, and empty states work.
4. Prefer one dependable view over several partial views.
5. Do not add export formats before the core workflow is reliable.
6. Do not add command-palette actions before the underlying action is stable.
7. Do not add diagnostics unless they help solve a real user problem.
8. Keep the typed frontend understandable without a component framework or runtime network dependencies.
9. Keep the production binary small and startup behavior predictable.
10. Ship one cohesive slice at a time.

## Development cadence

The intended cadence is one small feature slice every two days.

A slice should usually:

- Have one user-visible outcome.
- Touch one owning area.
- Avoid unrelated cleanup.
- Include a focused test when persistence or parsing changes.
- Update this roadmap when its status changes.
- Build successfully before the next slice starts.

Use these statuses:

- PARKED: remembered, but not planned.
- PLANNED: scope and acceptance criteria are clear.
- ACTIVE: current implementation slice.
- SHIPPED: included in a stable release.
- REJECTED: deliberately not returning.

Only one feature should be ACTIVE at a time.

## Recommended order

1. Stabilization and development guardrails.
2. Small theme refinement.
3. Simple loaded-document search.
4. Local-folder browsing.
5. Markdown task list.
6. Recoverable Trash.
7. Templates.
8. Canvas, only after all earlier features are cohesive.

## Feature 1: Stabilization guardrails

Status: ACTIVE

### User value

Changes remain safe and the application always has a known working build.

### First slice

- Keep one canonical build command.
- Keep one focused test command.
- Record binary size after stable releases.
- Add no new UI.

### Acceptance criteria

- `make build` creates `dist/markpad`.
- `go test ./...` passes.
- The binary opens with a clean temporary profile.
- Open, edit, save, reopen, and session restore work manually.
- The release version is consistent across source and packaging.

### Defer

- Large diagnostic dashboards.
- Copy/export actions for runtime statistics.
- Multiple overlapping validation documents.

## Feature 2: Themes

Status: PARKED

### User value

Comfortable light and dark reading without changing the product workflow.

### Minimal cohesive version

- Keep the existing default theme.
- Add one intentional dark theme.
- Store one theme preference.
- Apply the theme before the first visible paint.
- Use CSS variables only.

### Acceptance criteria

- Theme survives restart.
- Editor, preview, dialogs, menus, selection, and code blocks remain readable.
- No remote fonts, image packs, or runtime dependencies.
- Reduced-motion and contrast remain usable.

### Defer

- Large theme galleries.
- Theme labs and semantic preset generators.
- Separate commands for every palette.
- Theme import/export.
- More than two supported themes until both are polished.

### Previous experiments preserved conceptually

The later tree explored Paper, Linen, Dawn, Mist, Ink, Pine, Slate, Ember, Sand, Midnight, compact mode, reading width, and theme cycling. These are design references, not requirements.

## Feature 3: Loaded-document search

Status: PARKED

### User value

Find text across documents already open in Markpad.

### Slice 1: exact search

- Search title and content of loaded text documents.
- Show file, matching line, and a short snippet.
- Open the selected result.
- Cap work for large files.

### Slice 2: basic filters

- Filter by title, path, and file type.
- Preserve exact substring search.
- Define clear empty, no-result, and error states.

### Acceptance criteria

- Unicode queries return correct positions.
- Selecting a result opens the correct file and line.
- Rapid typing cannot display stale results.
- Large or binary files cannot freeze the UI.
- Search state is disposable and never canonical.

### Defer

- Fuzzy, wildcard, quoted, and negative query languages.
- Search-recents restore/import/export.
- CSV, JSON, and Markdown reports.
- Dozens of search-specific palette commands.
- Canvas bridges.
- Persistent indexing until folder search proves a real need.

## Feature 4: Local-folder workspace

Status: PARKED

### User value

Browse and open notes from one chosen folder without turning Markpad into a database-backed vault application.

### Slice 1: choose and browse

- Choose one local folder.
- List supported files with relative paths.
- Open a selected file.
- Clear or change the folder.

### Slice 2: create note

- Create one Markdown note with a safe filename.
- Handle collisions explicitly.
- Open the new note immediately.

### Slice 3: useful metadata

- Recent files inside the folder.
- A small folder summary.
- Tags or links only after browsing and creation are stable.

### Acceptance criteria

- Paths cannot escape the selected folder.
- Hidden, binary, and oversized files are handled safely.
- Folder preference survives restart.
- Removed or renamed folders produce a useful recovery state.
- File changes remain visible after refresh.

### Defer

- Daily and weekly generators.
- Link graphs and backlinks.
- Workspace inventory exports.
- Full-text indexing.
- Git integration.
- Multiple simultaneous workspaces.

## Feature 5: Markdown tasks

Status: PARKED

### User value

See and update Markdown checkbox tasks without introducing a separate task database.

### Canonical format

A task remains a Markdown checkbox line in its source file:

```markdown
- [ ] Write release notes
- [x] Publish build
```

Optional metadata must remain readable as plain text.

### Slice 1: parser

- Parse open and completed checkbox lines.
- Ignore fenced code blocks.
- Retain source file and line position.
- Cover parsing with table-driven tests.

### Slice 2: dependable list

- Show tasks from loaded Markdown files.
- Open the source line.
- Toggle a task and write back to the original file safely.

### Slice 3: local-folder tasks

- Scan the selected folder with strict file-size and count limits.
- Show source provenance.
- Prevent stale results.

### Acceptance criteria

- Toggling changes only the intended checkbox.
- Duplicate task text does not target the wrong line.
- External file changes are not silently overwritten.
- Empty, inaccessible, and malformed files fail safely.
- Closing and reopening shows the persisted result.

### Defer

- Calendar and kanban views.
- Priority workflow presets.
- ICS, CSV, JSON, and Todo.txt exports.
- Task-to-canvas bridges.
- Large sets of filters and palette shortcuts.
- Quick capture until the list and toggle workflow are reliable.

## Feature 6: Recoverable Trash

Status: PARKED

### User value

Accidental deletion can be reversed.

### Slice 1: unsaved drafts

- Move deleted drafts to a recoverable local Trash record.
- Show deletion time and title.
- Restore or permanently delete explicitly.

### Slice 2: saved files

- Move files only with clear confirmation.
- Preserve the original path.
- Handle path collisions during restore.
- Never silently discard unsaved editor content.

### Acceptance criteria

- Restore reproduces the original content.
- Missing directories and permission failures are reported.
- Permanent deletion requires unambiguous confirmation.
- Retention cleanup cannot delete outside Markpad-owned Trash storage.
- Listing Trash does not mutate it.

### Defer

- CSV, JSON, and Markdown Trash reports.
- Risk summaries and diagnostic dashboards.
- Many cleanup commands.
- Automatic expiration until manual recovery is proven dependable.

## Feature 7: Templates

Status: PARKED

### User value

Create a consistent note without repeatedly typing the same structure.

### Minimal cohesive version

- Store templates as ordinary Markdown files.
- Choose one template when creating a note.
- Replace only a small documented set of variables, such as date and title.
- Keep template editing outside specialized UI initially.

### Acceptance criteria

- Template source remains a plain file.
- Invalid variables remain visible rather than deleting content.
- Creation handles filename collisions.
- A template failure cannot create an empty note silently.

### Defer

- Template marketplaces.
- Complex scripting.
- Daily, weekly, meeting, project, and task variants before the generic workflow is stable.

## Feature 8: Command palette

Status: SHIPPED

### User value

Keyboard access to stable actions that already exist elsewhere.

### Shipped scope

- `Ctrl+P` opens the palette.
- Search covers stable actions and open files; `>` limits results to actions.
- Arrow keys, Enter, and Escape work predictably.
- Each action calls the same implementation as its visible UI control.

### Maintenance rules

- The palette never owns separate business logic.
- No command exists only to expose a report or preference variant.

### Defer

- Recents and categories.
- Disabled-action explanations and explicit focus restoration.
- Restore/import/export of command history.
- Hundreds of generated commands.
- Command-specific guides inside the palette.

## Feature 9: Canvas

Status: PARKED LAST

### Product decision

The previous canvas grew from a draft surface into tools, selection, layers, grid, snap, minimap, clipboard formats, inventory, maps, exports, task bridges, and many commands before the basic file workflow was dependable.

Canvas must not return as a large overlay. It should return only if a narrow use case is clear.

### Slice 0: validate the need

Choose one primary purpose:

- Small diagrams embedded beside Markdown notes.
- Freehand scratchpad.
- Portable node-and-edge map.

Do not attempt all three initially.

### Slice 1: format and viewer

- Define a versioned portable JSON document.
- Separate document content from camera and selection state.
- Validate file size and element counts.
- Open and render a saved document without editing.
- Round-trip fixtures through load and save tests.

### Slice 2: minimal editing

Support only:

- Select.
- Move.
- Rectangle.
- Text.
- Delete.
- Undo and redo with a strict memory cap.

### Slice 3: dependable persistence

- New canvas file.
- Save.
- Save as.
- Reopen.
- Recovery after malformed input or failed writes.

### Acceptance criteria

- Saving and reopening produces the same document.
- Selection and camera state do not pollute portable content.
- Invalid JSON never destroys the previous document.
- Large inputs are rejected before allocation-heavy rendering.
- Keyboard focus and shortcuts do not interfere with the note editor.
- The feature has direct tests for format migration and round trips.

### Defer

- Freehand pen, arrows, ellipses, sticky notes, layers, grid, snap, minimap, alignment, and inventories.
- PNG, SVG, Obsidian, Excalidraw, CSV, and Markdown exports.
- Clipboard merge/replace operations.
- Search, task, backlinks, outline, and workspace canvas bridges.
- Canvas-specific themes and dozens of palette commands.

## Feature 10: Diagnostics and performance

Status: PARKED

### User value

Make real performance regressions measurable without turning diagnostics into a product surface.

### Minimal cohesive version

- Build binary-size check.
- Repeatable startup measurement.
- Repeatable process-tree memory measurement.
- Developer documentation for interpreting results.

### Acceptance criteria

- Measurements use a clean temporary profile.
- Commands fail clearly when prerequisites are missing.
- Results state OS, webview, build tags, and sample duration.
- Measurements are not shown permanently in the main UI.

### Defer

- Runtime report modals.
- CSV, JSON, Markdown, and clipboard exports.
- Many user-facing memory cleanup commands.
- Diagnostics that do not lead to an actionable decision.

## Explicitly rejected patterns

Status: REJECTED

The following patterns caused feature sprawl and should not be repeated:

- Adding every feature to the command palette immediately.
- Creating copy, JSON, CSV, Markdown, and export variants before the main action works.
- Treating diagnostics as primary product features.
- Combining tasks, search, canvas, workspace, and Trash before each works independently.
- Shipping many preference presets instead of one understandable setting.
- Using the frontend monolith as the only place for parsing, persistence, rendering, and commands.
- Calling a feature complete because its happy-path UI exists.
- Adding a new view before source-of-truth behavior is tested.

## Feature proposal template

Copy this section when promoting a feature from PARKED to PLANNED.

```markdown
## Feature: Name

Status: PLANNED

### Problem
What specific user problem exists?

### Smallest useful slice
What is the single visible outcome?

### Source of truth
Which file or durable structure owns the data?

### Failure cases
What can be missing, malformed, stale, too large, or unwritable?

### Acceptance criteria
- Observable requirement
- Persistence/reopen requirement
- Error-state requirement
- Performance bound

### Deferred
What explicitly does not belong in this slice?

### Verification
Which focused tests and manual flow prove it?
```

## Release policy

A future release should contain a few cohesive features, not hundreds of micro-commits presented as separate capabilities.

Before declaring a feature shipped:

1. Run focused tests for its owning layer.
2. Run the complete Go test suite.
3. Build the production binary.
4. Exercise its main workflow using a clean temporary profile.
5. Reopen the application and verify persisted state.
6. Update this roadmap and release notes.
7. Record binary-size impact when frontend or dependencies changed.

## Repository scope

Previous implementations remain in Git history and may be studied for algorithms or UI ideas, but should not be copied back wholesale. Experimental applications under `ports/` are not built, tested, packaged, or released as Markpad; they should move to their own repository if development continues.
