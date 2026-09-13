# Upstream ZenNotes spacing study — 2026-09-13

The reference is upstream **ZenNotes 2.48.0**, commit
`f0e2a7a935dee2eb1edafd0721c8928457599dfe`, freshly cloned from
[ZenNotes/zennotes](https://github.com/ZenNotes/zennotes) into the ignored temporary
folder `dist/zennotes-study`. Earlier reviews used a modified local port; this
study runs upstream's web client with its real Go backend and an isolated sample
vault. All observations below come from this run.

Local reference: http://127.0.0.1:49628/ (Go API on loopback port 49629).
The temporary clone uses Bun 1.4.2 to install and run Vite; desktop install scripts
are skipped. Its own npm lockfile was migrated inside that temporary directory.
Only the dev proxy port and an API-server placeholder HTML were changed for this
study. Quillpane's packages and lockfile are unchanged by the reference setup.

## Captured flow and lessons

1. **List — clear and compact.** TasksRow uses 12 px horizontal / 6 px vertical
   padding, 8 px gaps and a smaller secondary text line. Group labels and a quiet
   hover/focus surface separate rows without a full grid of borders. Keyboard
   hints are focused on the current row. Some small, faint metadata warrants
   contrast testing rather than direct copying.

   ![ZenNotes task list](../dist/zennotes-study/captures/01-list.png)

2. **Board — consistent structure.** The compact toolbar leaves room for work.
   Columns align vertically and use 8 px gaps; cards use 10 px horizontal / 6 px
   vertical padding with subordinate metadata. The five default columns require
   horizontal scrolling at the observed 1280 px width. Quillpane retains its
   three-column fit and category model.

   ![ZenNotes board](../dist/zennotes-study/captures/02-board.png)

3. **Creation — focused.** One input, a clear focus outline, and a separate
   footer make the next action obvious. Cancel returned to the board. Quillpane
   retains inline creation for repeated entry; the useful lesson is grouping and
   alignment, not adding a modal or background blur.

   ![ZenNotes task creation](../dist/zennotes-study/captures/03-create.png)

4. **Note — clear separation of content and controls.** Compact shell controls
   surround a more spacious writing area. Sidebar selection is persistent and
   secondary actions have less visual weight. This pass leaves Quillpane's shell
   dimensions and editor behavior intact.

   ![ZenNotes note](../dist/zennotes-study/captures/04-note.png)

5. **Light mode — consistent geometry.** Theme switching retains the same
   spacing. Pale boundaries and low-contrast empty states deserve independent
   accessibility checks. These screenshots do not establish full accessibility
   compliance, native desktop behavior, or renderer performance.

   ![ZenNotes light board](../dist/zennotes-study/captures/05-board-light.png)

Source review: `packages/app-core/src/components/TasksView.tsx` around lines
769–843 (toolbar), `TasksRow.tsx` around 112–190 (rows), `TasksKanban.tsx` around
1757–1867 and 2015–2072 (columns/cards), and `styles/index.css` shared form labels
and typography. The principles are implemented with Quillpane's existing tokens;
no upstream component or stylesheet was imported.

## Applied to Quillpane

- Compact title and inline completion progress; 16 px content inset and shared
  4/6/8/10/12/16 px spacing tokens.
- Borderless list rows with a quiet hover/focus surface and full title wrapping.
- Softer card boundaries, 6 px card gaps, equal-height board columns and aligned
  Add task controls. Extra columns still scroll within the pane.
- Native checkbox, focus, menus, Markdown storage and recovery behavior retained.
  No dependency, timer, animation loop or layout measurement was added.

Fresh native comparison, same 1180 × 760 viewport and sample workflow:

| Before | After |
|---|---|
| ![Before board](../dist/performance/zen-spacing-before.json-board-light.png) | ![After board](../dist/performance/zen-spacing-after.json-board-light.png) |
| ![Before list](../dist/performance/zen-spacing-before.json-list-light.png) | ![After list](../dist/performance/zen-spacing-after.json-list-light.png) |

The board starts about 42 px higher, with a compact heading and consistent column
bottoms. Six ordinary list rows have a 44 px vertical rhythm rather than roughly
51 px. Native light/dark and 720 px / 110% scale captures were inspected.

## Verification

79 frontend tests, TypeScript, lint and formatting pass. Existing React compiler
warnings remain. All 50 native task checks pass, including categories, drag/drop,
Trash recovery, undo/redo, exact saving, theme contrast, narrow layouts, 500 tasks,
the 501-task source fallback and window/unsaved-close controls. Windows and Linux
frontend builds pass. Linux native rendering and PSS remain untested here.

The stripped normal Windows build remains **18,786,304 bytes**. Windows initial
JS is 1,210,978 bytes (+52), CSS 134,441 (+299), deferred diagrams 5,365,297
(unchanged). Linux-target JS is 6,559,251 bytes; CSS 135,588. Only generated
frontend assets are embedded; the temporary ZenNotes source/server/vault is not
part of Quillpane.

The final profiling run observed 628 ms first contentful paint and 177 ms for
500 tasks becoming visible (100 ms polling resolution). Post-GC process-tree
private memory was 221.4 MiB after the extended six-task/theme workflow,
240.0 MiB for 500 List tasks, and 256.7 MiB for 500 Board tasks. These are snapshots,
not peaks; multiple study/preview apps were running. They do not establish a
performance improvement or regression from this small spacing change. Raw data:
[verification JSON](zennotes-spacing-verification-2026-09.json).

The updated interactive preview is `dist/quillpane-spacing-preview.exe`, using
`dist/spacing-preview/profile` and a separate sample `Tasks.md`. The existing
windows and their drafts were not closed or overwritten. The normal output is
`dist/quillpane-refined.exe`. No release was published.
