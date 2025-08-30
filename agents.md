# Markpad Agent Guide

This file is the working contract for AI agents contributing to Markpad.

## Product intent

Markpad is a small native Markdown notepad/viewer. It should feel as immediate as a traditional Notepad or Mousepad-style desktop app, while adding a polished Markdown viewer, session restore, and a modern but quiet interface.

The core promise is:

- Native Go desktop app first.
- Minimal dependencies and no Electron/browser runtime.
- Very small release artifacts.
- Low idle memory and stable behavior with large text files.
- Plain files stay plain: `.md`, `.markdown`, `.txt`, logs, and other text-like files.
- Unsaved work survives app close through local drafts.
- Web/WASM edition is planned later, but desktop quality comes first.

## Tech constraints

- Use Go as the primary language.
- Use Gio for the native UI unless the user explicitly approves a rewrite.
- Keep dependencies lean; justify every new dependency.
- Do not add Electron, Tauri, webview wrappers, or heavy UI frameworks.
- Keep core file/session/preview logic testable outside the GUI.
- Prefer standard-library implementations for file IO, persistence, packaging scripts, and tests.

## UX principles

- Keep the app familiar: File, View, Help menus at the top.
- The main title should be the current file/note name.
- Only the Markdown and Viewer tabs should occupy the main mode switch area.
- Save and related action feedback should be visible but lightweight.
- Help, Tour, About, and Settings should open inside the app without losing the active note.
- Sidebar should show favorites/bookmarks above recent session notes.
- Closing and reopening should restore the same documents, drafts, preferences, and active note.
- Viewer mode should be beautiful, readable, and fast for Markdown.

## Persistence rules

- Unsaved drafts live under the app config directory.
- Never discard unsaved user content without an explicit action.
- File saves must be atomic where possible.
- Save to existing file path when known.
- New untitled notes remain drafts until a save-as path is chosen.
- Keep bookmark paths absolute and deduplicated.

## Performance rules

- Avoid reparsing Markdown unless content changed.
- Avoid full-file work during every frame when possible.
- Keep hover/animation effects cheap and disable them when reduced motion is enabled.
- Do not introduce background goroutines unless they have a clear lifecycle.
- Large-file work should move toward rope/piece-table storage and incremental preview parsing.

## Code quality

- Run `gofmt` on changed Go files.
- Keep imports grouped and minimal.
- Keep UI helpers small and named around visible product behavior.
- Add or update tests for session, file, preview, and formatting logic when changing those areas.
- Do not weaken existing tests.
- Do not commit generated build artifacts from `dist/`.

## Release/docs expectations

- Keep `README.md` useful for users and contributors.
- Keep `TODO.md` as the forward-looking roadmap.
- Put deeper product, architecture, packaging, and launch notes under `docs/`.
- Use MIT licensing unless the user says otherwise.
- Website/GitHub Pages assets should include screenshot placeholders and easy download sections.
