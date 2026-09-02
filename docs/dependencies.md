# Frontend dependencies

Production browser dependencies are locked through `frontend/bun.lock`, bundled by Bun 1.3.14, and embedded into the application. `node_modules` and build tools are never embedded.

The checked-in dependency set is pinned for the current development build (the
last published baseline is v0.13.0):

| Package | Version | Purpose |
|---|---:|---|
| React / ReactDOM | 19.2.8 | Interface rendering |
| Marked | 18.0.9 | Markdown parsing |
| DOMPurify | 3.4.13 | Rendered-HTML sanitization |
| highlight.js | 11.11.1 | Bounded code highlighting |
| `@codemirror/commands` | 6.11.0 | Source-editor keymaps, indentation, and incremental undo/redo history |
| `@codemirror/lang-javascript` | 6.2.5 | Incremental JavaScript, TypeScript, and JSX parsing |
| `@codemirror/language` | 6.12.4 | Language compartments and semantic highlighting |
| `@codemirror/legacy-modes` | 6.5.4 | Lazy parsers for the broader source-language set |
| `@codemirror/state` | 6.7.2 | Incremental editor state and transactions |
| `@codemirror/view` | 6.43.10 | Editor DOM, gutters, selection, and scrolling |
| `@lezer/highlight` | 1.2.3 | Shared semantic token tags for the CodeMirror theme |
| Lucide | 1.31.0 | Tree-shaken interface icon nodes |
| TanStack React Hotkeys | 0.10.0 | Cross-platform global shortcut lifecycle, metadata, and display |

TanStack Hotkeys is the only app-wide interaction helper. It replaces Markpad's manual app-wide key map, prevents stale React closures, and exposes the registered bindings to the Keyboard settings screen. CodeMirror is scoped to the editable code surface; its language modules are split and loaded only after a matching file opens. The adapters and their small core dependencies are bundled into the offline frontend, are MIT licensed, and make no runtime network calls. Neither package is used as general application state management. TanStack Highlight was evaluated and rejected for editing because it produces static HTML rather than an editor model.

Tailwind CSS, TypeScript, Oxlint, Oxfmt, and the Bun Tailwind plugin are build-time dependencies only. Markpad intentionally has no bundled PDF renderer, component suite, or secondary frontend bundler.

## Update procedure

1. Review the locked dependency and its upstream release notes.
2. Read its release notes and license.
3. Update through Bun and commit the resulting lockfile.
4. Confirm there are no HTTP production asset references.
5. Build the stripped Linux executable and record its size.
6. Exercise Markdown, fenced code, links, images, and PDF external handoff without network access.
7. Exercise folder navigation and workspace search against a representative bounded fixture.

Do not substitute an unpinned `latest` URL or add a package manager to the production runtime.

## Size policy

The hard release ceiling is 16 MiB. Source maps, `node_modules`, examples, development tools, PDF.js, and unused language packs must not be embedded; large optional features must remain code-split and off the startup path.

## Licensing

When dependency versions change, review their licenses and release notes. Markpad documentation must name or lock embedded versions rather than claiming whichever version a remote registry currently serves.
