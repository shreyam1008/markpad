# Frontend dependencies

Production browser dependencies are locked through `frontend/bun.lock`, bundled by Bun 1.3.14, and embedded into the application. `node_modules` and build tools are never embedded.

The current production dependency set is pinned:

| Package | Version | Purpose |
|---|---:|---|
| React / ReactDOM | 19.2.8 | Interface rendering |
| Marked | 18.0.9 | Markdown parsing |
| DOMPurify | 3.4.13 | Rendered-HTML sanitization |
| highlight.js | 11.11.1 | Bounded code highlighting |
| Lucide | 1.31.0 | Tree-shaken interface icon nodes |

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
