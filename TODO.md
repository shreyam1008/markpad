# TODO

## Completed (v0.1–v0.13.4)

- [x] Native preview clipboard copy and non-destructive preview Cut
- [x] Help release checks and guided update downloads

- [x] Go + Wails v2 app scaffold (replaced Gio)
- [x] Editor, Split, Preview modes with resizable divider
- [x] Formatting toolbar with SVG icons
- [x] Autosaved drafts, session restore, favorites, recent files
- [x] Version history with LCS-based unified diffs
- [x] Find bar with wrap-around (Ctrl+F)
- [x] Zoom (Ctrl+=/-/0, Ctrl+scroll)
- [x] Drag-and-drop reorder notes, drag-and-drop file open from OS
- [x] Right-click context menu: Star, File Info, Open Folder, Copy Path, Close, Delete
- [x] File verticals: Markdown, Code, Text, PDF, Image, Ebook/Office/Archive
- [x] Syntax highlighting for code files (highlight.js, capped at 5000 lines)
- [x] Lightweight PDF handoff to the operating system viewer
- [x] Image inline preview (base64 data URL)
- [x] Read-only document cards for ebook/office/archive
- [x] Single instance lock (second launch opens files in existing window)
- [x] CLI file arguments open on startup
- [x] File info modal with path, size, type, modified, Open Folder
- [x] Collapsible sidebar sections (Favorites / Open / Recent)
- [x] Sidebar: star on left, close on right
- [x] Status bar: file type, line/word/char counts, reading time, encoding
- [x] In-app changelog (Help > Changelog)
- [x] Preferences panel with file handling overview
- [x] Improved history diff contrast
- [x] Native OS file dialogs (Open, Save, Save As)
- [x] Auto-list continuation (bullets, numbered, task lists)
- [x] GitHub Actions CI/CD (Linux deb/AppImage, Windows exe, macOS dmg)
- [x] Native Linux rendered-window smoke test and WebKitGTK-safe embedded frontend bundle
- [x] Platform-aware Linux chrome without the duplicate native application menu
- [x] GitHub Pages website with SEO
- [x] Scroll position memory per note (editor + viewer + cursor)
- [x] Extended syntax highlighting (lua, dart, toml, dockerfile, cmake, elixir, nim, zig + full lang map)
- [x] Open Folder fix (xdg-open/open/explorer instead of file:// URL)
- [x] PDF dirty indicator fix (read-only files never show "NOT SAVED")
- [x] Performance: bounded local syntax highlighting and external PDF handoff
- [x] BUNDLE_BUDGET.md: size/memory cost tracking for every feature
- [x] Comprehensive agents.md with guardrails for AI-assisted development
- [x] React 19 + strict TypeScript component architecture with Bun build and tests
- [x] Fully bundled offline frontend with pinned direct dependencies
- [x] Command palette with fuzzy open-file/action switching (`Ctrl+P`)
- [x] Tab-style switching (`Ctrl+Tab` / `Ctrl+Shift+Tab`)
- [x] Workspace Lite: persist one local folder and browse supported relative paths
- [x] Workspace file navigation through `Ctrl+P`
- [x] Bounded exact workspace content search with file/line/snippet and match selection (`Ctrl+Shift+F`)
- [x] Manual workspace refresh, change, clear, and collision-safe note creation
- [x] Confirmed permanent saved-file deletion with dirty-edit warning and path-safety guards
- [x] Clean-checkout CI/release builds compile the embedded frontend before Go
- [x] Windows and macOS release icon resources restored
- [x] External-change protection before saving, with reload/overwrite/save-a-copy resolution
- [x] Title-derived, collision-safe filing of recovery drafts into Workspace Lite
- [x] Strict semantic design system, custom Wails chrome, unified icons, themes, and stable overlays
- [x] Shared keyboard catalog with interface scale, settings, and native menu labels
- [x] Responsive code/plain-text viewers with local overflow containment
- [x] Fresh privacy-safe screenshots for the website and README
- [x] Incremental CodeMirror editor with lazy language modes and bounded change history
- [x] Relative Markdown images resolved through the native boundary with bounded sequential hydration
- [x] Prose-first Markdown source wrapping and exact search/outline navigation across wrapped lines

## Live feature board

GitHub issues are the actionable cards; [the roadmap](docs/feature-roadmap.md) explains sequencing and product constraints.

### Now — v0.14.0

- [ ] [#1 Focus mode: distraction-free writing](https://github.com/shreyam1008/markpad/issues/1)
- [ ] [#2 Bounded source/preview scroll synchronization](https://github.com/shreyam1008/markpad/issues/2)
- [ ] [#3 Performance baseline and Windows bundle-headroom recovery](https://github.com/shreyam1008/markpad/issues/3)

### Next — validated plain-file workflows

- [ ] [#4 Workspace task list derived from Markdown checkboxes](https://github.com/shreyam1008/markpad/issues/4)
- [ ] [#5 Daily note quick open using ordinary workspace files](https://github.com/shreyam1008/markpad/issues/5)

### Explore — prove interaction and cost first

- [ ] [#6 Pinned reference note beside the active document](https://github.com/shreyam1008/markpad/issues/6)
- [ ] Refresh-on-focus after manual refresh behavior is measured
- [ ] Bounded local HTML/PDF export
- [ ] Signed/notarized macOS builds and tested store packages

### Performance backlog

- [ ] Recover at least 256 KiB of Windows amd64 bundle headroom before another runtime dependency
- [ ] Benchmark cold/warm start, private memory/PSS, typing latency, and folder scan/search
- [ ] Keep 1 MiB and 2 MiB fixture corpora outside release artifacts
- [ ] Investigate a rope or piece table only if the existing 2 MiB editable-file boundary changes
