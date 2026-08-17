# Current behavior contract

This document defines the behavior Markpad should preserve while it is cleaned up.

## Documents

Markpad opens local Markdown, plain-text, source-code, image, and PDF files. Text content can be edited and saved. Images are displayed locally. PDFs are represented by a read-only handoff card and open in the operating system's default PDF application. Images and PDFs do not expose editor, split, formatting, undo, revert, or save actions.

New unsaved notes are stored as drafts. Markdown is the default; the New menu can also create text, JSON, and YAML drafts. Normal application exit preserves dirty drafts. Choosing **Don't Save** while closing explicitly discards the dirty content.

Opening another file never writes the current draft to its source path. Pending edits are first copied to local recovery storage. Reopening a file that is already in the Open list focuses that document and preserves its recovery content instead of rereading the disk copy.

## Views

Markdown supports Editor, Split, and Preview. Every other editable text-based format, including plain text, JSON, YAML, config, and source files, supports Editor and Viewer/Code View without Split. Images, PDFs, and other binary formats expose only their dedicated read-only view. Controls for unsupported views are not shown.

Saved files open in Viewer by default. The selected view mode is remembered by canonical file path across switching, application restarts, and close/reopen. New drafts open in Editor so they are immediately writable. Unsupported or stale stored modes fall back to Viewer.

The active view, selection, and scroll position should remain stable while switching among open documents during a session.

## Saving and recovery

Save writes to the current path. Save As chooses a new path. Failed writes must leave editor content intact and produce a visible error.

Saved files can be renamed from the command palette, with `F2`, or from the file context menu. Rename stays within the current directory and updates the open document, favorites, recents, and session metadata.

## Keyboard workflow

`Ctrl+P` opens the command palette, which searches visibly separated Files and Actions; prefixing a query with `>` limits it to actions. Arrow keys select results and Enter opens or runs them. `Ctrl+Tab` and `Ctrl+Shift+Tab` move between open documents. `Ctrl+1`, `Ctrl+2`, and `Ctrl+3` select Editor, Split, and Preview/Code View when supported. Holding Ctrl or Command reveals shortcut badges on primary controls.

The session file, drafts, and history are stored below the user configuration directory. Writes use replacement through a temporary file so interrupted writes do not partially overwrite the previous state.

If the main session file cannot be decoded or contains an unsafe/invalid structure, Markpad preserves the unreadable file, starts a recoverable clean session, and tells the user what happened.

## History

History contains a bounded list of local snapshots created around open, save, Save As, and restore operations. Restoring a version first protects the current content with a snapshot. History is not synchronization, branching, or source control.

## Favorites and recent files

Favorites are user-managed shortcuts. Recent files are derived from opened files. Canonically equivalent paths should appear only once. Missing files remain identifiable and removable rather than failing silently.

## Offline and privacy

All parsing, sanitizing, syntax highlighting, document rendering, persistence, and history are local. Markpad has no telemetry and must not download runtime dependencies. External URLs open only after an explicit user action.
