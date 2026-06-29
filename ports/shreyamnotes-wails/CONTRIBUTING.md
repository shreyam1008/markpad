# Contributing to ZenNotes

Thanks for your interest in improving ZenNotes — a keyboard-first, Markdown-first
desktop notes app built on legacy desktop runtime, React, TypeScript, and CodeMirror 6.

## Before you start

- For **anything non-trivial**, open an issue first so we can agree on scope
  and approach before you spend time building.
- For **small fixes** (typos, obvious bugs, dependency bumps), open a PR
  directly.
- For **security issues**, do not open a public issue — follow
  [SECURITY.md](./SECURITY.md).

## Getting set up

```bash
git clone https://github.com/ZenNotes/zennotes.git
cd zennotes
bun install
bun run dev
```

Useful scripts:

- `bun run dev` — run the app with hot reload
- `bun run test` — run the test suite
- `bun run build` — produce a production build
- `bunx oxlint` — run the fast linter

## Working on a change

1. Fork the repo and create a feature branch from `main`.
2. Keep commits focused. A clear commit message beats a long PR description.
3. Add or update tests when you change behavior.
4. Make sure `bun run test` and `bun run build` pass locally.
5. Open a pull request against `main`.

## Pull request requirements

Branch protection on `main` enforces:

- **Pull request required** — no direct pushes
- **One approving review from a code owner** (see
  [.github/CODEOWNERS](./.github/CODEOWNERS))
- **Green CI** across Linux, macOS, and Windows build jobs
- **Linear history** (squash merge only; the head branch is auto-deleted)
- **All review comments resolved** before merging

## Style and scope

- Match the style of the surrounding code — don't introduce new patterns
  mid-file.
- Keep the scope of each PR tight. Refactors, feature work, and formatting
  changes belong in separate PRs.
- ZenNotes is keyboard-first. Every new user-facing feature should ship with a
  keybinding or leader flow.

## Code of conduct

Be kind, assume good faith, focus on the work.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](./LICENSE).
