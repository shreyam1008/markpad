# Tasks in one Markdown file

Choose **New → Task board** using the arrow beside New. New boards start with
**Backlog, To do, Today and Done**. **List**, **Board** and **Calendar**
show the same file; the last view you chose is remembered on this device.

- Categories are workflow stages, shown as columns in Board and a subtle category choice in List. Board cards omit the repeated category label.
- Edit and Trash icons appear when the card is hovered or contains keyboard focus.
  They remain visible on touch devices and retain their space to avoid layout shifts.
- Tags are separate small pills such as Work, Personal or Design. A task can have
  several tags. Use the tag button to select existing pills, or search and create
  a new label. Work and Personal are suggested to get started.
- Categories and tags receive stable, separate colors that adapt to light and dark themes.
  Open **Categories** for a dialog with names, ordering and color controls. Each swatch
  opens an OKLCH wheel with hue, chroma and lightness sliders. **Apply color** stores
  the choice in this Markdown file; **Automatic** restores its derived color.
  Cards use a subtle fill across the surface rather than a colored side stripe.
  Names remain visible, so color is never the only identifier.
- **Add task** inside a column opens a new card right there. Type a title, optionally
  add tags or a due date/time, then press Enter or **Add card**. Cancel/Escape discards the unsubmitted
  card. Leaving a valid card keeps it in the recovery draft. There is no permanent
  creation form above the board. List has its own compact Add task action.
- Click a column heading to collapse it to a narrow rail showing its name and
  count. Click again to expand. Collapsed columns still accept dropped cards;
  their cards are unmounted to reduce rendering work. Collapse is remembered for
  each document on this device and does not change the Markdown file.
- Tasks without a category appear in **No category**, shown only when needed.
  Task files have a distinct board icon in Open files and file search.
- Completion is a separate checkbox. Checking a task keeps its category.
- Drag cards between columns or before another card. The category picker works
  without dragging; **Edit → Move up / Move down** provides keyboard reordering.
- List reordering follows visible rows and preserves each task's category. Board
  reordering stays within its category; dropping between columns changes category.
- Rename categories in Categories. Removing one keeps its tasks, including tasks
  in Trash, with no category. Their tags remain unchanged.
- Drag a column by its header grip to reorder it. Focus that grip and use
  Alt+Left/Right, or **Earlier / Later** in Categories, for keyboard ordering.
  No category stays first when needed. Empty categories and their order are saved in Markdown.
- **Search tasks**, the top Search command, or Ctrl+F in task view opens a search sidebar.
  It filters titles, categories, tags and descriptions and highlights text matches in
  results and cards. Click a result to reveal it in List. Search is scoped to the active
  task file; editor search remains available in Editor. Show only open/completed tasks
  with the completion filter.
  **Clear filters** resets the view. Adding a task resets filters so it is visible.
- Right-click a card (or focus it and press Shift+F10) for Edit, Complete/Reopen,
  Move to category, Copy title and Move to Trash. Card buttons and drag/drop remain
  available. Dates stay left and the tag control stays right in Board card footers.
- The pencil beside the board heading opens that heading in Editor for renaming.
  Attached text appears as a short description on the card. **Edit** includes
  a Description field; **Edit source** opens the task's exact Markdown line for
  longer text or formatting. Return with **Tasks**.
- **Save task** applies an inline title, tag, description or due-date edit. Leaving a valid edit also
  keeps it in the recovery draft; **Cancel** or **Escape** cancels it. Apply the
  title before reordering. **Save** still controls writing the file to disk.

## Dates and calendar

Use the calendar button on a card to pick a due date and optional time. Today,
Tomorrow and a month grid are available; **Apply** keeps the selection and
**Clear** removes it. A time requires a date. Cards show the date and time;
overdue open tasks receive a subtle warning color.

**Calendar** pairs a compact six-week month on the left with the selected-day
agenda on the right. Expand Other scheduled days or Unscheduled to see more tasks.
Select a day, or **Add task on this day** to create one with that date.
Arrow keys move between dates. Unscheduled tasks remain in a separate section.
Search and completion filters also apply here; Trash is excluded.

Times are local wall-clock values, so the chosen day/time stays the same if you
move the file between time zones. These are due dates, not automatic alarms or
notifications. There is no cross-file calendar or background scheduler.

Older task files keep their existing behavior until you choose **Separate columns
and tags**. That undoable upgrade turns the old categories into task tags, places
open tasks in Backlog and checked tasks in Done, and preserves notes and Trash.
Unused old categories are replaced by the four workflow stages. Opening an old
file alone never rewrites it. You can inspect or undo the upgrade before saving.

## Trash and saving

The trash icon moves a task to this file's **Trash**. Open Trash to restore it.
**Board actions (•••) → Move completed to Trash…** asks before moving all completed tasks, including
those hidden by filters. The tasks remain recoverable. **Restore all** returns
everything from this file's Trash while retaining completion, categories and notes.
**Empty Trash…** asks before removing all trashed tasks, including filtered-out
ones. Cancel leaves them intact. Document Undo can recover an emptied Trash while
that undo state remains available; saved-version history follows the usual app
limits.

**Save** writes the Markdown file. Changes use the same recovery drafts, bounded
undo, atomic saves and external-change protection as ordinary notes. Undo and
redo also update the recovery draft. Trash belongs to the task file; it is not an
operating-system recycle bin or a place for deleted note files.

Use **Editor** for the source, or **Split** to see source and tasks together. A
normal Markdown note does not change behavior merely because it has checkboxes.
Only files beginning with the task marker opt into this view.

## File format

```markdown
<!-- quillpane:tasks -->
<!-- quillpane:workflow -->
<!-- quillpane:categories ["Backlog","To do","Today","Done"] -->
# My tasks

- [ ] Review the draft <!-- tags: ["Work","Design"] --> <!-- due: 2026-09-14T09:30 --> <!-- category: Today -->
  Keep the introduction short.
- [x] Take a walk <!-- tags: ["Personal"] --> <!-- category: Done -->
- [ ] An idea to organize later

## Trash

- [ ] An old reminder <!-- tags: ["Work"] --> <!-- category: Backlog -->
```

These are ordinary Markdown checkboxes. Small HTML comments identify the task
view, workflow categories, separate tags and optional due dates; the category record retains empty columns. Indented
notes move with their task. Unrelated prose, code examples and original line
endings are preserved by task edits. Tasks are top-level checkbox lines; nested
checkboxes in task notes are not separate cards. `## Trash` is reserved for removed
tasks. Close fenced code blocks before using task controls.

There is no database, sidecar task file, new dependency or background service.
The List/Board/Calendar and per-document collapsed-column preferences live in browser storage.
Collapse preferences retain at most 64 documents. The session also caches a
derived task-file flag for open-file icons; startup refreshes it from a bounded
32-byte source header read. Actual tasks, categories, tags, due dates and Trash remain in the file.
Colors are derived from names and require no separate color metadata.

## Responsive behavior and limits

The view uses Quillpane's semantic theme colors, text size, interface scale and
reduced-motion setting. Controls wrap at narrow widths; wide boards scroll inside
their pane. Moving or completing a task does not animate layout.

The task view supports **500 tasks including Trash**, **24 categories**, and
**200,000 source characters** in the interactive view. A larger or malformed file
shows an explanation and remains fully accessible in Editor, subject to the
existing 2 MiB editable-file boundary. The app never truncates source to fit the
task view. Category names are 1–40 characters; Untagged is reserved for legacy files.
Each task supports up to 8 tags of 1–40 characters. Commas separate tags;
angle brackets and control characters are not accepted.

See [the task verification report](tasks-verification-2026-09.md) for measured
Windows results and the Linux testing boundary.
See [the visual refinement report](task-design-refinement-2026-09.md) for the
subsequent design review and current build measurements.
See [workflow columns and tags](tasks-workflow-2026-09.md) for current verification.

See [the calendar refinement report](task-calendar-design-2026-09.md) for scheduling,
custom pickers, source preservation and current verification.

Custom colors use a separate `<!-- quillpane:colors {"categories":{},"tags":{}} -->`
record with bounded numeric OKLCH values. No sidecar, color library or network
service is required. Renaming a category carries its custom color with it.
