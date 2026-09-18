# Bundle and runtime measurement policy

Rendering regression tests use `happy-dom` 20.14.5 as a development-only DOM,
never an application import. This permits offline tests of the real sanitizer
and complete text/tree preservation; string mocks do not cover those behaviors.
Its contribution to embedded JavaScript is zero. Native layout/memory checks
remain separate. No new production rendering dependency is introduced.

Quillpane uses Go, Wails and the OS WebView. Go embeds only the generated production frontend. The owner removed the old Linux 16 MiB and Windows 16.1 MiB hard ceilings on 2026-09-12; sizes must still be measured and reported. No browser engine, Node, Bun, development dependency tree or source maps belong in release artifacts.

See [task planning and calendar](docs/tasks-release-design-2026-09.md) for current sizes, and the [badge/shared-renderer follow-up](docs/performance-followup-2026-09.md) for large-code measurements.

## Current local candidate

| Artifact | Bytes | Notes |
|---|---:|---|
| Stripped Windows executable | 18,835,456 | 17.96 MiB; baseline 16,792,576 bytes |
| Windows initial JavaScript | 1,243,733 | Baseline 4,622,285 bytes |
| Windows deferred diagram JavaScript | 5,365,297 | Embedded, loaded only on the first diagram |
| Windows CSS | 150,858 | Generated locally |
| Linux-target JavaScript | 6,592,500 | One WebKitGTK-safe entry; native runtime untested |
| Linux-target CSS | 152,005 | Generated locally |

These are local 2026-09-13 candidate builds with Go 1.27.1 and Bun 1.4.2, not published release artifacts. No current Linux executable size was measured. Earlier published v0.13.6 binaries measured 14,874,304 bytes on Linux and 16,061,440 bytes on Windows; those historical sizes are not evidence for this candidate.

## Runtime priorities

Measure the whole application tree. Windows private committed bytes are useful for comparisons; summed working set double-counts shared pages. Linux measurements should use process-tree PSS rather than summed RSS. Report pre/post-GC snapshots separately and do not label snapshots as peak memory.

The current candidate reduces ordinary-note memory and large plain-text layout costs. Mermaid 12 adds first-use time and retained memory; extremely heading-heavy Markdown is still expensive. See [the reproducible measurements](docs/performance-2026-09.md) for the actual tradeoffs, native checks and remaining limits.

Keep per-document costs bounded: the existing editable-file boundary is 2 MiB, image boundary 50 MiB, syntax-highlight cutoff 200,000 characters or 2,000 lines, browser history at most 80 states/1,000,000 characters (retaining the minimum large undo states), saved history 50 snapshots per document, and pre-save verification at most 10 MiB. Relative Markdown images retain their existing count/byte limits. PDF data is handed to the OS. Atomic persistence, recoverable drafts and external-modification protection must not be weakened to save RAM.

## Dependency and verification rules

- Keep direct frontend versions exact and the Bun lockfile committed; document versions, purpose and declared licenses in `docs/dependencies.md`.
- Keep all assets offline. No Electron, bundled browser engine, CDN, telemetry, cloud client, component suite or general state framework.
- Keep Linux/macOS on the proven single-module build. The Windows diagram script is a local classic script, not a split ES-module graph.
- Run frozen installation, frontend checks, canonical Go tests, native platform smoke tests, asset checks and stripped builds. `make check-size` and Windows CI now report size instead of imposing the historical ceilings.
- Compare like-for-like workloads and document the engine, toolchain, sampling method, native coverage and regressions. Size reduction alone does not prove lower RAM or faster startup.
