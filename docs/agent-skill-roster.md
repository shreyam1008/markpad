# Agent and Skill Roster

Updated: 2026-06-24

## Operating model

Markpad upgrade work uses one main orchestrator plus bounded parallel lanes:

- Main orchestrator: owns scope, integration, validation decisions, commits, and conflict control.
- Feature workers: implement small disjoint slices with explicit file ownership.
- QA/perf workers: run build, smoke, memory, and UI checks without editing files.
- Research workers: use primary sources for Wails, Go, WebKit, local-first formats, search, and canvas choices.

Workers must not edit unrelated dirty files. Current unrelated local files are `app.go` and `packaging/windows/installer.nsi` unless the user explicitly assigns them.

## Active validation commands

Use these before calling a stabilization checkpoint green:

```sh
make validate
make smoke-desktop
RUNS=1 SAMPLE_SECONDS=5 make memory
```

Use a longer memory pass before larger UI/canvas/search releases:

```sh
RUNS=3 SAMPLE_SECONDS=10 make memory
```

## High-ROI skills installed or available

These skills are relevant for the local-first Wails upgrade:

- `playwright`: browser automation for rendered frontend checks and screenshots.
- `playwright-interactive`: persistent browser/Electron-style interaction for iterative UI debugging.
- `screenshot`: desktop window capture when browser tooling cannot see Wails.
- `web-perf`: Core Web Vitals and frontend performance audit patterns for rendered surfaces.
- `product-design:audit`: evidence-based UX/design/accessibility audits from screenshots.
- `build-web-apps:frontend-testing-debugging`: rendered frontend validation workflow and QA report structure.
- `build-web-apps:frontend-app-builder`: UI concept/build workflow when creating new frontend surfaces.
- `build-web-apps:react-best-practices`: useful only if React/Next enters the stack; otherwise avoid.
- `pdf`: PDF inspection/generation workflow for document preview and export checks.
- `openai-docs`: official OpenAI docs lookup when OpenAI API/product work appears.
- `gh-fix-ci`: GitHub Actions failure triage when CI breaks.
- `gh-address-comments`: PR review-comment resolution.
- `security-best-practices`: targeted Go/JS/TS security review when requested.
- `security-threat-model`: repository-grounded AppSec threat models when requested.
- `define-goal`: long-running goal definition and guardrail hygiene.
- `cli-creator`: CLI/script design help for local tooling.
- `figma`, `figma-use`, `figma-generate-design`, `figma-implement-design`: design review/prototyping support if Figma is used later.
- `sentry`: error monitoring workflow if phase 2 adds telemetry or crash reporting; not used in current local-only phase.

## Skill policy for this phase

- Prefer local validation scripts over external services.
- Do not add deploy/cloud/telemetry skills to implementation unless the user explicitly moves to sync/cloud phase.
- Do not add heavy frontend runtimes or icon packs just because a skill supports them.
- Use screenshots carefully on Linux Wails: XWD can capture WebKit accelerated surfaces as blank even when the DOM is live. Prefer `make smoke-desktop` DOM probes for pass/fail boot validation.
