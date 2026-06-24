# Markpad Markdown task format

Markpad tasks are plain Markdown checkbox lines. The Markdown file is the source of truth; list, calendar, kanban, exports, and canvas boards are derived views.

## Contract

A task is any Markdown line that starts with a checkbox marker:

```markdown
- [ ] Draft release note !high due:2026-06-24 #release
- [ ] Wait for design review @waiting #design
- [x] Publish changelog due:2026-06-20 #release
```

Supported checkbox markers:

```markdown
- [ ] Open task
- [x] Done task
* [ ] Also valid
+ [ ] Also valid
```

## Canonical writes

Markpad should read portable Markdown task variants but write the smallest canonical checkbox form for new local tasks:

```markdown
- [ ] Open task
- [x] Done task
```

Append behavior invariants:

- The Markdown file remains the task source of truth.
- Appending plain text creates a Markdown checkbox line, not a sidecar record.
- Appending an existing task line normalizes the bullet to `-` and done state to lowercase `[x]`.
- Existing scanned files may keep valid Markdown bullets such as `*`, `+`, or ordered-list markers.
- Toggling a task changes only the checkbox state for that source line.

## Portable tokens

- `due:YYYY-MM-DD` marks a task due date with an ISO calendar date.
- `!high`, `!medium`, and `!low` mark priority.
- `!h`, `!med`, `!m`, and `!l` are accepted priority aliases.
- `@waiting` marks a task as blocked or waiting on someone/something.
- `#tag` marks a project, area, or topic.

## Views

- List view sorts and filters Markdown task lines.
- Calendar view groups tasks by `due:` date.
- Kanban view groups the same Markdown tasks by status and priority.
- Canvas export creates editable local sticky-note cards but does not rewrite the Markdown task source.

## Export formats

Markpad should keep these task escape hatches visible:

- Markdown for exact source-format portability.
- JSON for structured local automation.
- CSV for spreadsheets and audits.
- ICS VTODO for calendar tools.
- Todo.txt for simple task-manager migration.

## Non-goals for phase 1

- No hidden task database.
- No account, cloud sync, or external task service.
- No proprietary task IDs required in source files.
- No dependency-heavy task engine unless measured need appears.

## Future sync boundary

When sync is added, task files should sync like normal Markdown files. Machine-specific state such as selected task view, current filter, and modal scroll position should stay outside the content file.
