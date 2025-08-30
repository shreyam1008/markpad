# TODO

## Desktop MVP

- [x] Go project scaffold.
- [x] Native Gio window.
- [x] Left sidebar of notes.
- [x] Markdown source tab.
- [x] Viewer tab.
- [x] Autosaved unsaved drafts.
- [x] Session restore.
- [x] Open `.md`, `.txt`, and other text files from command-line args.
- [x] Bookmarked file locations in the sidebar.
- [x] App menus.
- [x] Help, Tour, About, and Settings pages.
- [x] Reduced motion and compact sidebar settings.
- [x] Collapsible sidebar.
- [x] In-app save-as modal with arbitrary extension support.
- [ ] Native open/save-as dialogs.
- [ ] File association for `.md`, `.markdown`, and `.txt`.
- [ ] Recent folder/workspace support.
- [ ] External file watcher and reload prompt.
- [x] Better Markdown preview basics: tables and task lists.
- [ ] Rich Markdown preview: links, images, code highlighting, nested lists, and inline emphasis.
- [ ] Source/preview scroll sync.
- [ ] Keyboard shortcuts: new, open, save, save as, source/viewer toggle.

## Large File Performance

- [ ] Replace full-string editor flow with a rope or piece-table document model.
- [ ] Incremental preview parsing by changed block range.
- [ ] Lazy preview layout for very large documents.
- [ ] Add benchmark corpus: 1 MB, 10 MB, 50 MB, 100 MB Markdown files.
- [ ] Track cold start time, idle RSS, typing latency, and preview refresh latency.

## Release Packaging

- [x] GitHub Actions CI.
- [x] GitHub Actions release workflow draft.
- [x] Linux `.deb` packaging draft.
- [x] Linux AppImage packaging draft.
- [x] Local Linux binary build script without root install.
- [x] Windows `.exe` artifact.
- [x] macOS `.dmg` artifact.
- [ ] Real PNG/icon pipeline for Gio/gogio.
- [ ] Signed/notarized macOS builds.
- [ ] Windows installer/MSI.
- [ ] AppImage smoke test in CI.

## Web Version, Parked For Later

- [ ] Build the Gio app for WebAssembly with `gogio -target js`.
- [ ] Decide local-first browser storage strategy: IndexedDB drafts plus optional file-system access API.
- [ ] Make the web app visually identical to desktop.
- [x] Create GitHub Pages website scaffold with screenshot and download placeholders.
- [ ] Wire website download links to real release artifacts.
- [ ] Consider a Rust/WASM parser only if Go/WASM preview becomes too heavy.
- [ ] Add a performance budget for web: load time, WASM size, first-input latency, large-note scroll latency.

## Product Ideas Later

- [ ] Command palette.
- [ ] Notion-like quick switcher.
- [ ] Plain file folder mode.
- [ ] Minimal backlinks/wiki-links.
- [ ] Export HTML/PDF.
- [ ] Theme settings.

## Documentation and Launch

- [x] Project-local agent guide.
- [x] MIT license.
- [x] Architecture, packaging, and launch docs.
- [ ] Add real screenshots to README and website.
- [ ] Publish GitHub Pages after repository settings are enabled.
