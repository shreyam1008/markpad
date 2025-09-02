# TODO

## Completed (v0.1 – v0.6)

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
- [x] PDF rendering via pdf.js (page-by-page canvas, lazy load)
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
- [x] agents.md, README.md, docs updated per version

## Next (v0.7+)

- [ ] Dark mode with OS theme detection and manual toggle
- [ ] Browser-compatible build (same app runs in browser via WASM or static)
- [ ] File watcher: detect external changes and prompt reload
- [ ] Source/preview scroll sync for Markdown
- [ ] Command palette (Ctrl+P)
- [ ] Tab-style switching (Ctrl+Tab / Ctrl+Shift+Tab)
- [ ] Export to HTML/PDF from Markdown
- [ ] Plain folder mode (open a directory as workspace)
- [ ] Signed/notarized macOS builds
- [ ] Windows NSIS installer
- [ ] Snap store / Flatpak packaging
- [ ] Real screenshots on website and README

## Performance (Ongoing)

- [ ] Rope or piece-table document model for very large files
- [ ] Incremental Markdown parsing
- [ ] Benchmark corpus (1 MB, 10 MB, 50 MB files)
- [ ] Track cold start time, idle RSS, typing latency
