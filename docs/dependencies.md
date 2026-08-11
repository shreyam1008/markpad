# Frontend dependencies

Production browser dependencies are pinned as files under `frontend/vendor` and embedded into the application.

The current dependency set provides:

- Markdown parsing through Marked.
- HTML sanitization through DOMPurify.
- Syntax highlighting through Highlight.js.
- PDF rendering through PDF.js.

## Update procedure

1. Identify the currently referenced pinned upstream version.
2. Read its release notes and license.
3. Replace only the required minified production files.
4. Keep PDF.js and its worker on exactly the same version.
5. Confirm there are no HTTP production asset references.
6. Build the stripped Linux executable and record its size.
7. Exercise Markdown, fenced code, links, images, and representative PDFs without network access.

Do not substitute an unpinned `latest` URL or add a package manager to the production runtime.

## Size policy

The target stripped Linux executable is at most 13 MiB. The hard release ceiling is 15 MiB. Correct local PDF rendering takes priority over retaining the older 10 MiB target, but unused language packs, source maps, examples, and development files must not be embedded.

## Licensing

When dependency versions change, update their accompanying license notices from the upstream distributions. Markpad's documentation must name the embedded versions rather than claiming whichever version a CDN currently serves.
