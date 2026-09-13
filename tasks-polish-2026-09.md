# Task UI finishing pass — 13 September 2026

Quillpane's task controls now have a clearer hierarchy: selected List/Board and
expanded Categories retain their selected colors under hover; primary actions
remain distinct; disabled form actions have neutral surfaces and readable labels.
Edit and Trash icons stay visible at rest in fixed 28 px controls. One focus ring
replaces the overlapping rings, category management uses the shared spacing, and
permanent Trash clearing uses the existing danger colors. Single-task Trash copy
now reads correctly. Task storage, recovery and rendering limits are unchanged.

## Reference and visual review

Revisited the running upstream [ZenNotes](https://github.com/ZenNotes/zennotes)
2.48.0 study at commit `f0e2a7a935dee2eb1edafd0721c8928457599dfe`:
compact controls, quiet secondary actions and consistent surface relationships.
The reference remains in ignored `dist/zennotes-study`; no reference code,
runtime or dependency was added to Quillpane.

Fresh native captures use the same fixture and 1180 × 760 viewport. Compared
before/after: card actions are discoverable, disabled Add task is quieter, and
the title/actions occupy less vertical space. The dark view and 720 px window at
110% scale retain wrapping and contained scrolling. The Trash confirmation keeps
Cancel neutral and distinguishes permanent clearing from recoverable moves.

| Before | After |
|---|---|
| ![Before](../dist/performance/tasks-polish-before.json-board-light.png) | ![After](../dist/performance/tasks-polish.json-board-light.png) |

![Dark board](../dist/performance/tasks-polish.json-board-dark.png)
![Narrow list](../dist/performance/tasks-polish.json-list-narrow.png)
![Trash confirmation](../dist/performance/tasks-polish.json-trash-confirm.png)

## Verification and delivery

Frontend typecheck, 82 tests, lint and formatting pass; pre-existing React compiler
warnings remain. Canonical Go tests/vet and release metadata validation pass.
**70 native Windows checks pass.** Native evidence is recorded in [verification JSON](tasks-polish-verification-2026-09.json).
The checks include task persistence, recovery, undo/redo, categorization, filtering,
ordering, Trash, 500 tasks, oversized fallback, native window controls and twelve
theme combinations. Added rendered checks cover selected-button pointer hover,
stable geometry, visible actions and neutral disabled controls. Contrast checks
also cover primary hover and danger color pairs.

One intermediate native run failed after unexpected text changed its isolated
fixture title from `A` to `Arite`; the final run was repeated separately. No task
logic was changed to bypass that assertion.

| Artifact | Bytes |
|---|---:|
| Normal stripped Windows executable | 18,791,424 |
| Windows initial JavaScript | 1,214,474 |
| Windows deferred diagrams | 5,365,297 |
| Windows CSS | 135,838 |
| Linux-target JavaScript | 6,562,796 |
| Linux-target CSS | 136,985 |

The executable grew 1,024 bytes from the task v1 candidate. Both frontend targets
build with Bun 1.4.2; the Windows executable uses Go 1.27.1. Native Linux appearance,
startup and PSS remain unverified on this Windows host. This is visual polish,
not evidence of a RAM reduction or a runtime floor.

The normal build is `dist/quillpane-refined.exe`. The interactive build is
`dist/quillpane-polish.exe`, with a separate instance/profile and sample
`dist/polish-preview/My tasks.md`. Existing windows and drafts were preserved.
The profiling executable is test-only; it must not be distributed. No release
was published.

Final profiling run: first contentful paint about 584 ms from launch; 500 list
rows visible in about 181 ms (100 ms polling resolution). After forced JS GC,
process-tree private memory measured 210.2 MiB after the extended six-task/theme
workflow, 227.4 MiB for 500 List tasks and 246.6 MiB for 500 Board tasks. These
are workflow snapshots, not peaks or clean idle baselines. Timing and memory
vary across runs; no performance improvement is claimed for this polish.
