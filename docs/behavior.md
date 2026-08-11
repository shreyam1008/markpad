# Current behavior contract

This document defines the behavior Markpad should preserve while it is cleaned up.

## Documents

Markpad opens local Markdown, plain-text, source-code, image, and PDF files. Text content can be edited and saved. Images are displayed locally. PDFs are represented by a read-only handoff card and open in the operating system's default PDF application. Images and PDFs do not expose editor, split, formatting, undo, revert, or save actions.

New unsaved notes are stored as drafts. Normal application exit preserves dirty drafts. Choosing **Don't Save** while closing explicitly discards the dirty content.

## Views

Markdown supports Editor, Split, and Preview. Plain text and source files use the editor and an appropriate read view. Images and PDFs use dedicated read-only views.

The active view, selection, and scroll position should remain stable while switching among open documents during a session.

## Saving and recovery

Save writes to the current path. Save As chooses a new path. Failed writes must leave editor content intact and produce a visible error.

The session file, drafts, and history are stored below the user configuration directory. Writes use replacement through a temporary file so interrupted writes do not partially overwrite the previous state.

If the main session file cannot be decoded, Markpad should preserve the unreadable file, start a recoverable clean session, and tell the user what happened.

## History

History contains a bounded list of local snapshots created around open, save, Save As, and restore operations. Restoring a version first protects the current content with a snapshot. History is not synchronization, branching, or source control.

## Favorites and recent files

Favorites are user-managed shortcuts. Recent files are derived from opened files. Canonically equivalent paths should appear only once. Missing files remain identifiable and removable rather than failing silently.

## Offline and privacy

All parsing, sanitizing, syntax highlighting, document rendering, persistence, and history are local. Markpad has no telemetry and must not download runtime dependencies. External URLs open only after an explicit user action.
