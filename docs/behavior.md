# Current behavior contract

This document defines the behavior Quillpane should preserve while it is cleaned up.

## Documents

Quillpane opens local Markdown, plain-text, source-code, image, and PDF files. Text content can be edited and saved. Images are displayed locally. PDFs are represented by a read-only handoff card and open in the operating system's default PDF application. Images and PDFs do not expose editor, split, formatting, undo, revert, or save actions.

New unsaved notes are stored as drafts. Markdown is the default; the New menu can also create text, JSON, and YAML drafts. Normal application exit preserves dirty drafts. Choosing **Don't Save** while closing explicitly discards the dirty content.

Opening another file never writes the current draft to its source path. Pending edits are first copied to local recovery storage. Reopening a file that is already in the Open list focuses that document and preserves its recovery content instead of rereading the disk copy.

## Views

Markdown supports Editor, Split, and Preview. Every other editable text-based format, including plain text, JSON, YAML, config, and source files, supports Editor and Viewer/Code View without Split. Images, PDFs, and other binary formats expose only their dedicated read-only view. Controls for unsupported views are not shown.

Saved files open in Viewer by default. The selected view mode is remembered by canonical file path across switching, application restarts, and close/reopen. New drafts open in Editor so they are immediately writable. Unsupported or stale stored modes fall back to Viewer.

The active view, selection, and scroll position should remain stable while switching among open documents during a session.

## Saving and recovery

Save writes to the current path. Save As chooses a new path. Failed writes must leave editor content intact and produce a visible error. Quillpane records the disk content it opened or last saved; if that source changes, is replaced, disappears, or cannot be verified after a legacy-session restore, a normal save pauses before writing. The user must explicitly choose to keep editing, save a copy, reload the disk version, overwrite it, or recreate a deleted file.

Conflict reload first records the current Quillpane draft in Version History, then makes the verified disk content the clean recovery copy. Overwrite and recreate are explicit destructive choices.

Saved files can be renamed from the command palette, with `F2`, or from the file context menu. Rename stays within the current directory and updates the open document, favorites, recents, and session metadata.

A saved file can be permanently deleted only after a clear frontend confirmation. If it has unsaved edits, the warning states that those edits and local recovery history will also be removed. The backend refuses directories, symlinks, unsafe paths, and files that are not already-open saved files. Deleting an unsaved draft remains a separate local-recovery action.

## Individual-file contract

Quillpane opens individual files and recovery drafts. The folder workspace feature was removed in 0.13.6 at the product owner's request, including scanning, folder search, draft filing, persisted roots, and their commands. Legacy session roots are ignored; documents and recovery drafts remain compatible.

- `Ctrl+O` opens files and `Ctrl+P` searches open documents and actions.
- `Ctrl+F` searches the active document. Favorites and recents reopen individual files.
- File badges combine a symbol, extension, and semantic color; color is never the sole identifier.
- Split scroll sync follows normalized reading progress in either direction and can be turned off.
- Help exposes About, installed/latest versions, updates, and the offline Driver.js tour. Starting or leaving the tour must not change or save documents.
- Do not restore folder scanning, indexing, watchers, or workspace commands without separate approval.

## Keyboard workflow

`Ctrl+P` opens the command palette, which searches visibly separated Files and Actions; prefixing a query with `>` limits it to actions. `Ctrl+F` searches the active file. Arrow keys select results and Enter opens or runs them. `Ctrl+Tab` and `Ctrl+Shift+Tab` move between open documents. `Ctrl+1`, `Ctrl+2`, and `Ctrl+3` select Editor, Split, and Preview/Code View when supported. Holding Ctrl or Command reveals shortcut badges on primary controls.

The session file, drafts, and history are stored below the user configuration directory. Writes use replacement through a temporary file so interrupted writes do not partially overwrite the previous state.

If the main session file cannot be decoded or contains an unsafe/invalid structure, Quillpane preserves the unreadable file, starts a recoverable clean session, and tells the user what happened.

## History

History contains a bounded list of local snapshots created around open, save, Save As, and restore operations. Restoring a version first protects the current content with a snapshot. History is not synchronization, branching, or source control.

## Favorites and recent files

Favorites are user-managed shortcuts. Recent files are derived from opened files. Canonically equivalent paths should appear only once. Missing files remain identifiable and removable rather than failing silently.

## Offline and privacy

All parsing, sanitizing, syntax highlighting, document rendering, persistence, and history are local. Quillpane has no telemetry and must not download runtime dependencies. External URLs open only after an explicit user action.
