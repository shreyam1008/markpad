# Markpad local-first upgrade plan

## Goal

Markpad should become a durable local-first notes workspace where plain files stay canonical, richer views are layered on top, and future features do not force sync, cloud, or heavyweight runtime costs.

## Reference source

- Available local reference: `temp/zennotes`
- Not available: `/temp/zencode`
- When plan details are unclear, prefer patterns already present in `temp/zennotes` over inventing new architecture.

## Non-negotiable constraints

- Local-first only. No sync, account, cloud, or remote-state work for now.
- Files on disk are the source of truth. Derived state must be rebuildable.
- Do not introduce large frontend libraries, heavy binaries, or always-on background services.
- Memory use must stay low enough for modest machines; favor bounded caches and incremental work.

## File-first UX model

- Notes, tasks, canvas docs, and trash metadata should map cleanly to user-visible files.
- UI features are views over files, not replacements for files.
- If a feature needs hidden state, keep it minimal, local, and disposable.
- Import/export should preserve simple file ownership and avoid lock-in.

## Roadmap

- Search: keep loaded-file search fast, add local-folder indexing only as a disposable local index, and avoid making the index canonical.
- Canvas: keep a lightweight custom path, store canvas data in file-backed formats, and defer any heavy drawing/editor stack.
- Tasks: treat Markdown task lines as canonical and build list/calendar/kanban views from those files.
- Trash: use soft delete with clear restore and cleanup behavior; keep deletion reversible by default.
- Theme: extend through tokens and variables, not asset-heavy theming systems.
- Icons: prefer inline SVG, CSS, or small local assets; do not add large icon packs.

## Low-RAM and binary guardrails

- Cap search/index work by file size, file type, and queue depth.
- Stream or batch file processing; avoid loading large folders into memory at once.
- Keep indexes, caches, and previews optional and rebuildable.
- Prefer existing platform/runtime capabilities before adding new native dependencies.
- Reject features that materially increase binary size unless they unblock core local-first value.

## Validation cadence

- Validate at the plan level before implementation starts on a new area.
- Validate again after each small backend milestone, not only at the end of a large branch.
- Re-check this document whenever roadmap scope changes, local-first assumptions shift, or a new dependency is proposed.

## Commit strategy

- Keep commits small and single-purpose.
- Separate groundwork from behavior changes where practical.
- Update this document in the same change set when architecture, constraints, or roadmap intent changes.
- Do not batch speculative roadmap changes with unrelated implementation.

## Anti-drift guardrails

- Do not let search, tasks, canvas, or trash become database-first products; files remain canonical.
- Do not sneak in sync prerequisites "for later". If sync ever becomes real scope, it needs an explicit plan revision.
- Do not add heavyweight editor/canvas/icon dependencies as shortcuts.
- Do not store essential user data only in caches, indexes, or opaque internal formats.
- Do not diverge from `temp/zennotes`-backed patterns without writing down why in this document first.
