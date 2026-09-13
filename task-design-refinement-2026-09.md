# Task design refinement — 2026-09-13

Quillpane's working task view now has a distinct file identity, quieter controls,
colored categories and more compact layouts. The reference review used the local
ZenNotes source in `ports/shreyamnotes-wails`: `TasksRow.tsx`, `TasksKanban.tsx`
and `packages/shared-domain/src/tasklists.ts`. Useful ideas were compact rows,
subtle category cues and secondary actions revealed on hover/focus. Quillpane
retains its own category model, typography, themes and Markdown transforms.

## Observed before and after

1. **List and file identity.** The existing list worked, but every task showed
   competing controls and task files looked like ordinary Markdown. The refined
   list has named color tags, quiet edit/trash buttons, a small completion meter
   and a boxed board icon in Open files and file search. Hidden secondary actions
   retain their space, appear on keyboard focus and stay visible on touch.
2. **Board.** The third column was clipped at the tested desktop width. Three
   standard columns now fit at 1180 px. Further columns scroll inside the pane.
   Each column has a count, subtle color cue and an Add task shortcut that focuses
   the composer with that category selected. Completion remains independent.
3. **Narrow windows and themes.** The previous stacked rows spent unnecessary
   height on controls. Rows now wrap naturally, filters stay compact and the pane
   does not widen the application at 720 px with 110% text zoom. Light/dark
   screenshots were reviewed; rendered category text and borders were checked in
   all twelve palette/mode combinations. This is targeted QA, not a complete
   accessibility certification or native Linux visual audit.

Fresh captures from this review, stored in the ignored performance directory:

| Before | After |
|---|---|
| ![Previous board](../dist/performance/tasks-refine-before.json-board-light.png) | ![Refined board](../dist/performance/tasks-refined.json-board-light.png) |
| ![Previous narrow list](../dist/performance/tasks-refine-before.json-list-narrow.png) | ![Refined narrow list](../dist/performance/tasks-refined.json-list-narrow.png) |

## Storage and implementation

Keep one normal `.md` file: the existing opt-in marker, category comments,
checkboxes, attached notes and Trash section. No migration, database or sidecar.
Colors derive deterministically from category names. Renaming can change a
category's color; duplicate colors are possible and names always remain visible.
The session caches a derived task flag for icons; startup reads only a 32-byte
header per Markdown document to recover that flag. Metadata comments no longer
appear as new task-draft titles. Source remains authoritative.

No dependencies were added. Semantic light/dark category tokens use RGB alpha
fills and borders. Native inspection found that the current Bun CSS lowering
could drop some `color-mix()` declarations in multi-property rules; these new
styles avoid that output problem. Theme contrast probes wait for style settling
before measurement. Motion changes only paint, never card layout.

## Verification and measurements

- Bun **1.4.2**: 79 tests pass, TypeScript, lint and formatting pass. Existing
  React compiler warnings in App/DocumentWorkspace remain.
- Go **1.27.1**: canonical root/internal/integration tests and vet pass, including
  new task identity/restart/source-preservation checks.
- Native Windows WebView2 **152.0.4191.66**: **50 task checks** pass, covering
  edits, categories, drag/reorder, Trash, restore, clear cancellation, undo/redo,
  recovery, saving, theme changes, 500 tasks, the 501-task source fallback,
  maximize/restore, titlebar double-click, minimize/restore and unsaved-close
  cancellation. Minimize verification checks content after restoring; it is not
  an independent OS window-state assertion.
- Ordinary-note native regression passes draft recovery, exact saves, undo/redo,
  external-change protection, large text selection and offline diagram rendering.
- Windows and Linux frontend builds pass. Asset scan found no runtime remote
  dependency; task capture observed only local Wails asset requests. Release
  metadata remains 0.13.8. `git diff --check` passes.

| Production artifact | Bytes |
|---|---:|
| Stripped Windows executable | 18,786,304 |
| Windows initial JavaScript | 1,210,926 |
| Windows deferred diagram JavaScript | 5,365,297 |
| Windows CSS | 134,142 |
| Linux-target JavaScript | 6,559,198 |
| Linux-target CSS | 135,289 |

The Windows binary grew 9,216 bytes from the first task version. The runtime
still uses Go and the OS WebView; Bun and Node are not shipped.

The final task run observed first contentful paint at **525 ms** from launch and
500 tasks ready in **157 ms** (100 ms polling resolution). Whole-process-tree
private-memory snapshots after forced JS GC were **217.6 MiB** after the six-task
workflow, **235.8 MiB** for 500 list tasks and **249.1 MiB** for 500 board tasks.
The workflow includes twelve theme changes, native checks and retained caches;
these are neither cold task-file memory nor peaks, and are not directly comparable
to the older, shorter task workflow. No memory improvement is claimed here.

The separate ordinary-note run measured **166.0 MiB** after GC, consistent with
the prior candidate. The heading-heavy 1 MB Markdown stress fixture still uses
**371.1 MiB** after GC. This refinement does not establish a runtime memory floor.
Linux native appearance, startup and PSS remain unmeasured on this Windows host.

Raw task evidence: [JSON](task-design-refinement-2026-09.json). Reproduce with the
isolated profiling builder and `.github/scripts/smoke-tasks-windows.mjs`; ordinary
regressions use `.github/scripts/benchmark-windows.mjs`. Never distribute the
profiling executable, which enables localhost debugging.

The normal build is `dist/quillpane-refined.exe`. The separately launched
`dist/quillpane-preview.exe` has an isolated instance ID and profile under
`dist/refined-preview/profile`, and opens `dist/refined-preview/Tasks.md`.
The user's already-running `dist/markpad.exe` was left intact. Neither preview
enables debugging. No release was published.
