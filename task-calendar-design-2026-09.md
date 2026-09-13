# Task planning refinement — September 2026

## Design review

The current-run screenshots showed three sources of friction: repeated native
category selectors made cards look like forms, the Notes disclosure hid useful
context behind an unclear label, and neither tags nor scheduling offered a
selection flow. Column order existed only in the category manager.

The running upstream ZenNotes study was revisited visually and in source.
Its calendar uses a stable six-week month, local-date arithmetic and a separate
unscheduled area. These are useful patterns for Quillpane's single-file model.
The study remains in ignored `dist/zennotes-study`; no reference runtime or
dependency is bundled. Relevant source: upstream
[`TasksCalendar.tsx`](https://github.com/ZenNotes/zennotes/blob/f0e2a7a935dee2eb1edafd0721c8928457599dfe/packages/app-core/src/components/TasksCalendar.tsx).

| Flow | Finding and resulting change |
|---|---|
| Board | Compact stage button opens a custom, keyboard-operable category chooser. Header grips move complete columns; Alt+Left/Right remains available. |
| Tags | Existing tags are selectable pills. Search can create a new label. Selection is independent of stage and completion. |
| Task context | Attached Markdown text appears as a short description. Edit exposes a description field; full source remains accessible. |
| Scheduling | Optional local date and time appear on the card. Date chooser has a month grid, Today/Tomorrow shortcuts, time input, Apply and Clear. |
| Calendar | Six-week month shows task counts and short titles. Selecting a day opens its agenda; creation assigns that date. Unscheduled tasks remain accessible. |

Edit and Trash remain hover/focus actions. Popups close with Escape, outside
click or focus departure and retain visible keyboard focus. The calendar has
arrow-key date navigation. Existing semantic themes, bounded task rendering,
recoverable Trash, source-preserving mutations and explicit save remain in use.

Fresh comparison evidence:

| Before | After |
|---|---|
| ![Before](../dist/performance/tasks-calendar-before.json-workflow-light.png) | ![After](../dist/performance/tasks-calendar.json-scheduled-board.png) |

![Stage chooser](../dist/performance/tasks-calendar.json-category-menu.png)
![Tag selection](../dist/performance/tasks-calendar.json-tag-picker.png)
![Date and time](../dist/performance/tasks-calendar.json-due-picker.png)
![Calendar](../dist/performance/tasks-calendar.json-calendar-light.png)

## Data and performance boundaries

Due metadata is `<!-- due: YYYY-MM-DD -->` or
`<!-- due: YYYY-MM-DDTHH:mm -->`, between tags and category comments. Times are
floating local wall-clock values, not UTC instants. Impossible calendar dates
and times are rejected. This is planning metadata; no alarms or notifications
are scheduled. Calendar filtering uses the active file only and excludes Trash.

Descriptions remain indented Markdown source. Unchanged descriptions are not
rewritten by other edits; editing a description preserves the file's line-ending
style. Longer existing descriptions remain accessible through Editor; the task
description field is bounded to 10,000 characters.

Popups and calendar cells mount only where needed. Date labels reuse formatters;
one shared minute/focus clock refreshes due-state labels and is cleaned up when
the task view unmounts. Calendar day buckets avoid repeated source parsing.
There are no new packages, database, background service or network dependencies.
Native Linux appearance, startup and PSS remain unverified on the Windows host.


## Final verification and candidate sizes

The final Windows native run passed **105 checks**, including whole-column
movement, custom category selection, tag selection without typing, first/last
tag changes with an open chooser, Escape focus restoration, scheduled creation,
local due-time persistence, descriptions, Trash/undo, themes and narrow layouts.
It also exercises 500-task List and Board views and the over-limit fallback.
See [the native result](tasks-calendar-verification-2026-09.json).

Frontend typecheck, **89 tests**, lint and formatting pass. Existing React
Compiler warnings remain in App/DocumentWorkspace; no new task-control warnings
were introduced. Go tests and vet, release metadata agreement, runtime asset
scan and source-map exclusion pass. Both frontend platform targets were built;
the final embedded assets were rebuilt for Windows.

Scaled WebView scrolling exposed fractional positions at an integer Go API
boundary. The client now rounds read positions, with a regression test. A
scheduled focus fallback now avoids taking focus from a newly opened chooser.
Picker focus uses preventScroll, and date selection is cleared when leaving a
composer so a new unscheduled card cannot inherit it.

| Artifact | Bytes |
|---|---:|
| Normal stripped Windows executable | 18,818,560 |
| Windows initial JavaScript | 1,232,858 |
| Windows deferred diagram JavaScript | 5,365,297 |
| Windows CSS | 144,647 |
| Linux-target JavaScript | 6,581,414 |
| Linux-target CSS | 145,794 |

The normal executable is **17.95 MiB**, up 18,944 bytes from the preceding
hover-actions candidate. Builds use Bun 1.4.2 and Go 1.27.1. The runtime embeds
compiled frontend assets, with no Bun, Node or browser engine bundled.

The final instrumented run recorded first contentful paint at **671 ms** from
launch and 500 legacy task rows ready in **234 ms** (100 ms polling resolution).
Process-tree private committed memory after forced JavaScript GC was **211.1
MiB** after the extended six-task/theme workflow, **243.5 MiB** for 500 List tasks
and **260.6 MiB** for 500 Board tasks. These are workflow snapshots under a
profiling build, not ordinary-note idle measurements or peaks. They do not
prove a RAM reduction or a floor, and the 500-task fixture is not a maximum-tag
workflow board. Native Linux performance has not been measured.

The interactive sample is `dist/quillpane-planning.exe`, opened with its own
instance/profile and `dist/planning-preview/My board.md`. Existing user windows
and files are preserved. The normal candidate is `dist/quillpane-refined.exe`;
profiling builds are test-only. Nothing was committed or published.
