# Task view verification — 2026-09-13

This is a local Quillpane candidate, not a published release. See the
[task file guide](tasks.md). ZenNotes' local TasksKanban, TasksRow, TrashView and
task-list helpers informed the interactions; this implementation uses Quillpane's
own source transforms, styling and persistence without importing its app layers.

## Verification

- **79 frontend tests passed**, including eight task-domain tests covering source
  preservation, CRLF, Unicode, fenced examples, moving, Trash/restore, category
  limits and stale edits. TypeScript, lint and formatting passed. Existing
  unrelated React lint warnings remain; the task component/helper introduce none.
- **38 native Windows task checks passed**: New, reopening, categories,
  independent completion, drag/drop, keyboard ordering, edit/rename, category
  removal without losing tasks, Trash confirmation/cancel/restore, undo/redo,
  recovery draft updates, native Save, raw source, input undo, themes preserving
  composer text, reduced motion and narrow layout.
- A 500-task fixture works in List/Board and filters correctly. At 501 tasks, the
  view explains the limit while all source remains accessible in Editor.
- Visual inspection covered light/dark at 1180 px, and 720 px at 110% interface
  scale. Boards scroll inside their pane. Native drag events were exercised with
  CDP, not an exhaustive physical mouse/touch audit.
- The existing native note regression suite passed draft persistence, undo/redo,
  exact saves and external-change protection, plus large text and diagrams.
- Canonical Go tests, Go vet, version validation and diff whitespace checks passed.
  Version remains 0.13.8; no packages were added.
- Linux-target frontend build passed with the existing single ES module. **Native
  Linux startup, memory, drag/drop and window behavior remain untested.**

## Size

Comparison with the immediately preceding badge/shared-renderer candidate:

| Artifact | Before, bytes | Task candidate, bytes |
|---|---:|---:|
| Stripped Windows executable | 18,753,536 | 18,777,088 |
| Windows initial JavaScript | 1,191,849 | 1,208,690 |
| Windows deferred diagrams | 5,365,297 | 5,365,297 |
| Windows CSS | 122,946 | 129,576 |
| Linux single-module JavaScript | 6,539,803 | 6,556,860 |
| Linux CSS | 124,093 | 130,723 |

This adds **23 KiB to the Windows executable** and **16.45 KiB to initial JS**.
The executable is 17.91 MiB. There is no new engine, database or runtime service.
No Linux executable was built here.

## Windows measurements

The profiling builder uses an isolated Wails/WebView2 instance with temporary
fixtures and a fresh profile. It does not open personal notes. These are
process-tree private committed-memory snapshots after explicit JS GC, **not
peaks**. Summed working set in the capture double-counts shared pages.

| Point in the same task workflow | Private memory | JS heap |
|---|---:|---:|
| Six tasks after editing, theme, scale and Trash checks | 193.5 MiB | 4.33 MiB |
| 500 tasks in List | 216.3 MiB | 9.70 MiB |
| 500 tasks in Board after filtering/view switches | 233.7 MiB | 7.43 MiB |

Observed app-ready time was 731 ms and first contentful paint 746 ms from launch.
Opening the 500-task file later in that process was observed at 142 ms, with
roughly 100 ms polling resolution. These are single-run observations, not latency
guarantees or evidence of faster startup.

A separate ordinary-note regression run measured 165.9 MiB private memory after
GC, consistent with the preceding candidate. The task workflow includes extra
interaction and WebView caches, so the six-task value is not an isolated measure
of task overhead. This work does not remove the system engine's memory cost or
establish a memory floor. Very large rich Markdown remains separate performance
work.

## Reproduce

Build the frontend first, then run from the repository root on Windows:

```powershell
python .github/scripts/build-performance-windows.py dist/performance/quillpane-tasks-profile.exe
bun .github/scripts/smoke-tasks-windows.mjs dist/performance/quillpane-tasks-profile.exe dist/performance/tasks-native.json
bun .github/scripts/benchmark-windows.mjs dist/performance/quillpane-tasks-profile.exe dist/performance/tasks-regression.json
```

The profiling executable enables localhost CDP and must never ship. Normal
`dist/markpad.exe` is built separately without instrumentation. Screenshots are
written beside the output JSON. The final measurements and assertions are in
[tasks-verification-2026-09.json](tasks-verification-2026-09.json).
