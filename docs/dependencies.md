# Frontend dependencies

Production browser dependencies are locked through `frontend/bun.lock`, bundled by Bun 1.3.14, and embedded into the application. `node_modules` and build tools are never embedded.

The checked-in dependency set is pinned for v0.13.6:

| Package | Version | Purpose |
|---|---:|---|
| Driver.js | 1.8.0 | Offline, keyboard-accessible guided Help tour |
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

TanStack Hotkeys owns app-wide shortcuts. It replaces Markpad's manual app-wide key map, prevents stale React closures, and exposes the registered bindings to the Keyboard settings screen. CodeMirror is scoped to the editable code surface; its language parsers initialize when a matching file opens; production code remains in one WebKit-safe bundle. The adapters and their small core dependencies are bundled into the offline frontend, are MIT licensed, and make no runtime network calls. Neither package is used as general application state management. TanStack Highlight was evaluated and rejected for editing because it produces static HTML rather than an editor model.

Tailwind CSS, TypeScript, Oxlint, Oxfmt, and the Bun Tailwind plugin are build-time dependencies only. Markpad intentionally has no bundled PDF renderer, component suite, or secondary frontend bundler.

## Update procedure

1. Review the locked dependency and its upstream release notes.
2. Read its release notes and license.
3. Update through Bun and commit the resulting lockfile.
4. Confirm there are no HTTP production asset references.
5. Build the stripped Linux executable and record its size.
6. Exercise Markdown, fenced code, links, images, and PDF external handoff without network access.
7. Exercise the complete Help tour, restart/exit, narrow layout, and Split scrolling in both directions.

Do not substitute an unpinned `latest` URL or add a package manager to the production runtime.

## Size policy

The hard release ceilings are 16 MiB on Linux and 16.1 MiB on Windows. Source maps, `node_modules`, examples, development tools, PDF.js, and unused language packs must not be embedded. The production frontend stays a single WebKitGTK-safe module until native testing proves split modules reliable.

## Licensing

When dependency versions change, review their licenses and release notes. Markpad documentation must name or lock embedded versions rather than claiming whichever version a remote registry currently serves.

Driver.js is MIT licensed and includes its CSS locally. Its anchored popovers and keyboard/focus lifecycle avoid a bespoke positioning framework. Version 1.8.0 was reviewed against upstream configuration/API documentation. Installed package files remain development inputs; only used code/styles enter the binary. The complete refinement adds about 31 KB raw JavaScript while removing about 7 KB CSS, and the stripped Windows binary is 16,790,016 bytes. See BUNDLE_BUDGET.md for final release measurements.
