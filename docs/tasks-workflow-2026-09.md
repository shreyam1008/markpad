# Workflow columns, tags and inline cards — 13 September 2026

New task boards separate workflow stages from labels. Backlog, To do, Today and
Done are initial categories; Work, Personal and other user labels are small tag
pills. Moving or renaming a category preserves tags. Completion remains an
independent checkbox, as in existing task files.

Column headings toggle between full columns and narrow named rails with counts.
Collapsed columns retain their drop targets and accessible expand buttons while
unmounting cards. Preferences are stored locally per document, bounded to 64
documents. Category order and task contents stay in Markdown.

Add task opens a focused card inside its column. Enter/Add card commits and leaves
a blank composer ready for another task; Cancel/Escape closes the unsubmitted
card, including from the tag input. Leaving a valid card commits through the
existing recovery pipeline. The permanent creation row is absent from workflow
boards. List has a compact Add task action. Category selection remains available
without dragging. Tags are edited alongside titles and included in search.

## Compatibility and format

Older files retain their old behavior until **Separate columns and tags** is
chosen. That undoable upgrade assigns old category names as tags on their tasks,
puts open tasks in Backlog and checked tasks in Done, and preserves task notes,
Trash, unrelated prose and line endings. Unused legacy categories are replaced
by the four workflow columns. The upgrade refuses invalid or over-limit tags
instead of dropping them. Opening a legacy file does not rewrite it.

See [the task guide](tasks.md) for the ordinary Markdown format. A workflow marker
distinguishes the new layout; task metadata has independent category and JSON tag
comments. Tags are bounded to eight names of 1–40 characters per task. Existing
500-task, 24-category and 200,000-character interactive limits remain in place.
No dependencies, background processes or layout animations were added.

## Visual review and verification

Fresh native captures cover light, dark, inline creation and a narrow window at
110% scale. The first visual review caught Add task overlapping cards with notes;
the flex sizing was corrected and a rendered geometry assertion now checks that
the add action follows the full card height. Collapsed count badges retain
horizontal numerals for readability.

![Workflow board with Done collapsed](../dist/performance/tasks-workflow.json-workflow-light.png)
![Inline card creation](../dist/performance/tasks-workflow.json-workflow-composer.png)
![Narrow board](../dist/performance/tasks-workflow.json-workflow-narrow.png)

85 frontend tests pass, including independent-tag persistence through moves,
Trash, restore, edits and category renaming; CRLF preservation; legacy conversion
at the category limit; tag validation and injection rejection. Typecheck, lint,
formatting, canonical Go tests/vet and release metadata validation pass. Existing
React compiler warnings outside TaskDocument remain.

**86 native Windows checks pass.** Measurements are recorded in
[verification JSON](tasks-workflow-verification-2026-09.json). Coverage includes
the earlier task lifecycle and window controls, plus four-stage defaults,
collapsed geometry/unmounting, persisted collapse state, inline focus and
creation, independent tag edits/search, Cancel/Escape, blur recovery, saving,
expansion, narrow containment and exact undo of a legacy upgrade.

| Artifact | Bytes |
|---|---:|
| Normal stripped Windows executable | 18,799,104 |
| Windows initial JavaScript | 1,219,962 |
| Windows deferred diagram JavaScript | 5,365,297 |
| Windows CSS | 138,158 |
| Linux-target JavaScript | 6,568,310 |
| Linux-target CSS | 139,305 |

The executable grew 7,680 bytes from the preceding polish build. Both frontend
targets build with Bun 1.4.2; Windows uses Go 1.27.1. Native Linux appearance,
startup and PSS remain unverified. The measurements are workflow snapshots,
not peaks or proof of a RAM floor. Collapse avoids rendering hidden cards;
the existing bounded Markdown source remains in memory.

Normal output: `dist/quillpane-refined.exe`. Interactive sample:
`dist/quillpane-workflow.exe` with its own instance/profile and
`dist/workflow-preview/My board.md`. Existing windows and documents are preserved.
Profiling executables are test-only and must not be distributed. No release was
published.

The final profiling run recorded first contentful paint at about 595 ms and
500 legacy task rows at about 146 ms (100 ms polling resolution). Process-tree
private memory after forced JS GC was 218.6 MiB after the extended six-task/theme
workflow, 236.1 MiB for 500 List tasks and 249.4 MiB for 500 Board tasks. Those
fixtures retain the legacy category layout; no claim is made that they measure
500 workflow tasks with eight tags each.

Follow-up: Edit/Trash actions now appear only on card hover or keyboard focus,
with touch visibility and stable geometry. All 88 native checks and 85 frontend
tests pass. Current stripped Windows build is 18,799,616 bytes; CSS is 138,420
bytes for Windows and 139,567 for Linux. JavaScript is unchanged. Native evidence
is in `dist/performance/tasks-hover.json`; preview is `dist/quillpane-hover.exe`.
