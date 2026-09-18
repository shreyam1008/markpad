# Dependencies

The Wails rendering optimization adds `happy-dom` 20.14.5 (MIT) as an exact
development-only dependency. A separate DOM test process exercises the actual
DOMPurify renderer and verifies large-document tree, text and sanitization
fidelity. String-only tests cannot exercise that boundary. It is never imported
by application code or included in the embedded assets. Native engine layout
and memory still require desktop measurements; Happy DOM is not a substitute.

Audited on 2026-09-12. Direct versions are exact pins and `frontend/bun.lock` is committed. All direct frontend/build versions matched the npm registry's stable `latest` tag; a frozen install and `bun outdated` completed successfully. This is a dated audit, not a promise that future registry versions match this document.

| Package | Before → candidate | Use | Declared license |
|---|---|---|---|
| `@codemirror/commands` | 6.11.0 → 6.11.0 | Browser | MIT |
| `@codemirror/lang-javascript` | 6.2.5 → 6.2.5 | Browser | MIT |
| `@codemirror/language` | 6.12.4 → 6.12.4 | Browser | MIT |
| `@codemirror/legacy-modes` | 6.5.4 → 6.5.4 | Browser | MIT |
| `@codemirror/state` | 6.7.2 → 6.7.4 | Browser | MIT |
| `@codemirror/view` | 6.43.10 → 6.43.11 | Browser | MIT |
| `@lezer/highlight` | 1.2.3 → 1.2.3 | Browser | MIT |
| `@tanstack/react-hotkeys` | 0.10.0 → 0.10.0 | Browser | MIT |
| `dompurify` | 3.4.13 → 3.4.15 | Browser | (MPL-2.0 OR Apache-2.0) |
| `driver.js` | 1.8.0 → 1.8.0 | Browser | MIT |
| `highlight.js` | 11.11.1 → 11.12.0 | Browser | BSD-3-Clause |
| `lucide` | 1.31.0 → 1.45.0 | Browser | ISC |
| `marked` | 18.0.9 → 18.0.12 | Browser | MIT |
| `mermaid` | 11.17.2 → 12.0.0 | Browser | MIT |
| `react` | 19.2.8 → 19.3.0 | Browser | MIT |
| `react-dom` | 19.2.8 → 19.3.0 | Browser | MIT |
| `@types/react` | 19.2.18 → 19.3.0 | Build only | MIT |
| `@types/react-dom` | 19.2.4 → 19.3.0 | Build only | MIT |
| `bun-plugin-tailwind` | 0.1.2 → 0.1.2 | Build only | MIT |
| `oxfmt` | 0.63.0 → 0.67.0 | Build only | MIT |
| `oxlint` | 1.78.0 → 1.82.0 | Build only | MIT |
| `tailwindcss` | 4.3.3 → 4.3.3 | Build only | MIT |
| `typescript` | 7.0.2 → 7.0.2 | Build only | Apache-2.0 |

React provides the existing UI; Marked and DOMPurify parse and sanitize Markdown. Mermaid 12 supplies offline diagrams, loaded as an embedded classic script on Windows only when needed. CodeMirror remains the incremental code editor, while highlight.js is the bounded static renderer. Lucide imports remain static. TanStack Hotkeys handles shortcut lifecycles, and Driver.js supplies the existing offline guided tour. No component suite or general state manager was introduced.

Bun 1.4.2 bundles browser code and Tailwind CSS. TypeScript 7.0.2 invokes its native compiler; Oxlint and Oxfmt are native development tools. Build executables, Node, `node_modules`, tests and source maps are not embedded. See [Bun releases](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2) and [the npm registry](https://registry.npmjs.org/).

Go 1.27.1 is pinned in the module and CI ([official stable downloads](https://go.dev/dl/)). Wails v2.15.0 is the latest v2 module reported by the Go proxy at the audit; GitHub's `/releases/latest` still pointed to v2.14.0. Go's selected runtime graph uses go-webview2 v1.0.23, x/sys v0.48.0, x/net v0.59.0, x/crypto v0.57.0 and x/text v0.42.0. Wails remains the only direct application Go dependency. The OS WebView engine is updated by the OS/runtime distribution, not npm or the app bundle.

Scope of “latest”: direct browser/build packages and compatible selected Go runtime dependencies were upgraded. Transitive npm packages remain within their parents' supported ranges; unused Wails CLI/tool dependency modules are still selected by Wails' own manifest. They have not all been forcibly overridden to unrelated newest majors. The historical Flatpak manifest remains pinned to its published 0.13.4 source commit and matching offline dependency sources; it must be regenerated against a real release commit during publication. No placeholder commit or store publication is implied.

## Updating and measuring

Review upstream changes and declared licenses, update exact direct pins, regenerate the lockfile, then run frontend checks, canonical Go tests, vet, production builds and native smoke tests. Mermaid's major upgrade passed native Windows rendering; native Linux remains pending. Do not force transitive majors without testing the parent integrations.

Binary size is informational at the owner's request. All production assets remain embedded and offline, with Windows diagram loading tested in the native WebView2 host. Linux/macOS retain one ES-module entry; do not enable ES-module splitting without native WebKitGTK testing. The only added app code is narrow renderer/loading/text-processing code; no new package was added. See [performance evidence](performance-2026-09.md) for size, startup, memory, tradeoffs and remaining work.
