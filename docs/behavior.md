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

Save writes to the current path. Save As chooses a new path. Failed writes must leave editor content intact and produce a visible error. Markpad records the disk content it opened or last saved; if that source changes, is replaced, disappears, or cannot be verified after a legacy-session restore, a normal save pauses before writing. The user must explicitly choose to keep editing, save a copy, reload the disk version, overwrite it, or recreate a deleted file.

Conflict reload first records the current Markpad draft in Version History, then makes the verified disk content the clean recovery copy. Overwrite and recreate are explicit destructive choices. Resolving a conflict refreshes the Workspace Lite inventory when a folder is open.

Saved files can be renamed from the command palette, with `F2`, or from the file context menu. Rename stays within the current directory and updates the open document, favorites, recents, and session metadata.

A saved file can be permanently deleted only after a clear frontend confirmation. If it has unsaved edits, the warning states that those edits and local recovery history will also be removed. The backend refuses directories, symlinks, unsafe paths, and files that are neither supported workspace members nor already-open saved files. Deleting an unsaved draft remains a separate local-recovery action.

## Workspace Lite

The user may select one local folder. Markpad persists that choice, scans supported regular text files (including visible extensionless text such as `README` and `Makefile`) within fixed limits, and displays relative paths without importing or copying content. Hidden paths, symlinks, and common generated/dependency directories are excluded. Change, clear, and refresh (`F5`) are explicit actions; there is no filesystem watcher.

`Ctrl+P` fuzzy-searches open documents, workspace filenames/relative paths, and existing application actions. A selected workspace file opens through the normal document lifecycle.

`Ctrl+Shift+F` runs case-insensitive exact search across the cached bounded inventory. Results show relative path, one-based line, and a short snippet. Opening a result focuses the file and selects the exact occurrence using the returned zero-based UTF-16 column and preview offsets. Rapid queries must not surface stale results. Search is disposable and does not create a database or persistent index.

New workspace files may be Markdown or text, never overwrite an existing path, and cannot escape the root. An unsaved Markdown or text recovery draft can be filed directly into the workspace: Markpad suggests a collision-free path from its first useful line, allows an editable nested relative path, and promotes the same open document to the new plain file. Manual refresh makes other external additions, removals, and content edits visible.

## Keyboard workflow

`Ctrl+P` opens the command palette, which searches visibly separated Files and Actions; prefixing a query with `>` limits it to actions. `Ctrl+Shift+F` opens workspace content search. `Ctrl+Shift+Enter` files the active unsaved Markdown/text draft in the open workspace. Arrow keys select results and Enter opens or runs them. `Ctrl+Tab` and `Ctrl+Shift+Tab` move between open documents. `Ctrl+1`, `Ctrl+2`, and `Ctrl+3` select Editor, Split, and Preview/Code View when supported. Holding Ctrl or Command reveals shortcut badges on primary controls.

The session file, drafts, and history are stored below the user configuration directory. Writes use replacement through a temporary file so interrupted writes do not partially overwrite the previous state.

If the main session file cannot be decoded, Markpad should preserve the unreadable file, start a recoverable clean session, and tell the user what happened.

## History

History contains a bounded list of local snapshots created around open, save, Save As, and restore operations. Restoring a version first protects the current content with a snapshot. History is not synchronization, branching, or source control.

## Favorites and recent files

Favorites are user-managed shortcuts. Recent files are derived from opened files. Canonically equivalent paths should appear only once. Missing files remain identifiable and removable rather than failing silently.

## Offline and privacy

All parsing, sanitizing, syntax highlighting, document rendering, persistence, and history are local. Markpad has no telemetry and must not download runtime dependencies. External URLs open only after an explicit user action.
