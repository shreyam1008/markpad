# Frontend dependencies

Markpad's browser code is installed from `frontend/bun.lock`, bundled into `frontend/dist`, and embedded in the production Go binary. The application does not load packages, scripts, styles, fonts, or document renderers from the network at runtime.

## Production packages

| Package | Version | Purpose |
|---|---:|---|
| DOMPurify | 3.4.13 | Sanitize rendered Markdown before DOM insertion |
| highlight.js | 11.11.1 | Core plus explicitly registered source-language grammars |
| Marked | 18.0.9 | Parse GitHub-flavored Markdown |

Markpad has no frontend component framework, state-management library, PDF renderer, icon package, or runtime package manager. PDFs are opened in the operating system's viewer.

## Build-only packages

| Package | Version | Purpose |
|---|---:|---|
| Bun Tailwind plugin | 0.1.2 | Bundle Tailwind styles |
| Oxfmt | 0.63.0 | Formatting |
| Oxlint | 1.78.0 | Static analysis |
| Tailwind CSS | 4.3.3 | Utility CSS generation |
| TypeScript | 7.0.2 | Strict checks for typed modules |

## Update procedure

1. Review the upstream release notes and license.
2. Change an exact version in `frontend/package.json`.
3. Run `bun install` in `frontend/` and commit the resulting lockfile.
4. Run `make check` and confirm there are no HTTP production-asset references.
5. Build the stripped executable and record frontend and binary sizes in `BUNDLE_BUDGET.md`.
6. Smoke test Markdown, fenced code, external links, image preview, and PDF external handoff while offline.

Do not use `latest` declarations. Version changes should be intentional and reviewable.

## Size policy

The complete raw `frontend/dist` output must remain at or below 512 KiB. The stripped release binary has a hard 15 MiB ceiling. Source maps, `node_modules`, examples, development tools, PDF.js, and unused highlight.js language packs must not be embedded.
