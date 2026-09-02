# TODO

## Completed (v0.1–v0.12)

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

## Next

- [ ] Browser-compatible build (same app runs in browser via WASM or static)
- [ ] File watcher: detect external changes and prompt reload
- [ ] Source/preview scroll sync for Markdown
- [ ] Export to HTML/PDF from Markdown
- [ ] Signed/notarized macOS builds
- [x] Windows NSIS installer
- [ ] Snap store / Flatpak packaging
- [x] External-change detection before overwriting an open saved file
- [ ] Optional refresh-on-focus after manual refresh behavior is proven
- [ ] Measure Workspace Lite scan/search latency on representative folder corpora

## Performance (Ongoing)

- [ ] Rope or piece-table document model for very large files
- [ ] Incremental Markdown parsing
- [ ] Benchmark corpus (1 MB, 10 MB, 50 MB files)
- [ ] Track cold start time, idle RSS, typing latency
