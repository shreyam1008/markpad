# Frontend dependencies

Production browser dependencies are locked through `frontend/bun.lock`, bundled by Bun, and embedded into the application. `node_modules` and build tools are never embedded.

The current dependency set provides:

- Markdown parsing through Marked.
- HTML sanitization through DOMPurify.
- Interface rendering through React and ReactDOM.

Tailwind CSS, TypeScript, Oxlint, Oxfmt, and the Bun Tailwind plugin are build-time dependencies only. Markpad intentionally has no bundled PDF renderer, syntax-highlighting engine, icon library, or secondary frontend bundler.

## Update procedure

1. Review the locked dependency and its upstream release notes.
2. Read its release notes and license.
3. Update through Bun and commit the resulting lockfile.
4. Confirm there are no HTTP production asset references.
5. Build the stripped Linux executable and record its size.
6. Exercise Markdown, fenced code, links, images, and PDF external handoff without network access.

Do not substitute an unpinned `latest` URL or add a package manager to the production runtime.

## Size policy

The target stripped Linux executable is at most 13 MiB. The hard release ceiling is 15 MiB. Source maps, `node_modules`, examples, development tools, PDF.js, and unused language packs must not be embedded.

## Licensing

When dependency versions change, update their accompanying license notices from the upstream distributions. Markpad's documentation must name the embedded versions rather than claiming whichever version a CDN currently serves.
