# Markpad UI direction

Markpad should feel like a fast local workbench, not a heavy web app. The visual system should reinforce that: compact, calm, textured, and precise, with enough polish that the app feels finished without adding image-heavy assets or runtime dependencies.

## Product feel

- Local-first: every surface should make it clear that files, tasks, trash, search, and canvas data stay on the machine.
- Workbench, not IDE clone: keep the sidebar and split view, but avoid tab overload or language that reframes open files as the primary product model. Prefer source chips, command actions, and lightweight modals over persistent chrome.
- Dense but readable: show useful status and controls, but keep typography small, high-contrast, and grouped.
- Fast feedback: command palette actions should update status text immediately. Long-running local operations should report counts, scope, and completion.

## Layout direction

- Sidebar: file/source navigation plus the primary `+ New` create menu for Note, Daily note, Weekly note, Task file, Canvas, Open folder, Search folder, and validated Other file; keep recents, favorites, local folder actions, and compact badges visible here.
- Center: editor/preview split remains the primary mode, with presets for writing, review, and preview-heavy reading.
- Bottom/status: practical local stats: file type, line/word/selection, cursor, read time, memory, and binary/runtime diagnostics.
- Overlays: search, commands, tasks, trash, settings, and canvas should share focused modal treatment with strong keyboard access.

## Visual language

- Themes: CSS-variable themes only. Keep Paper/Linen/Dawn/Mist for light work and Ink/Pine/Slate/Ember for dark work.
- Do not add theme screenshots, texture PNGs, paper scans, or packaged theme variants. Theme identity should come from variables, spacing, borders, and contrast.
- Texture: use subtle borders, inset highlights, and shadows from variables instead of raster backgrounds.
- Icons: prefer inline SVG or short text glyphs. No bundled icon packs unless a tiny curated subset is hand-inlined.
- Do not add icon webfonts, runtime icon loaders, or framework-sized SVG/icon bundles. If a new glyph is necessary, hand-inline a purpose-built SVG and keep it small.
- Every shipped SVG must stay self-contained: no external hrefs, embedded raster payloads, scripts, or font-face rules.
- Motion: small lift/focus effects only, with reduced-motion support.

## Asset discipline

- Asset budgets in `assets_test.go` are hard guardrails, not targets. Prefer zero new files unless the UI meaningfully improves.
- New visual assets must be product-generic, not theme-specific. A theme should still be a palette and surface treatment, not a separate media pack.
- If a visual idea needs heavy imagery or a bundled library to read correctly, it is the wrong fit for Phase 1.

## Feature-specific polish

- Create: keep the sidebar `+ New` menu explicit about Note, Daily note, Weekly note, Task file, Canvas, Open folder, Search folder, and Other file with validated text-safe extensions and lightweight starters.
- Search: keep source scopes visible, show operator hints, highlight matches, and make result source counts obvious.
- Tasks: keep the affordance framed as "Tasks from loaded files" and "Tasks.md setup, list, calendar, kanban"; list/calendar/kanban are views over Markdown files, not a separate workspace type.
- Task workflow: sidebar Task actions should expose List, Calendar, Kanban, Quick task, and Task setup without introducing virtual tabs.
- Tasks: one Markdown task source, multiple views. List/calendar/kanban should feel like filters over files, not a separate database.
- Trash: show retention state clearly, keep cleanup explicit, and avoid hiding permanent delete behind ambiguous language.
- Canvas: keep the top-bar canvas positioned as the active canvas opener; it should load the selected `.markcanvas.json` file when active and fall back to the local scratch canvas otherwise.
- Canvas workflow: sidebar Canvas actions should distinguish Open canvas, New canvas file, Write active, Save draft JSON, and Loaded files map.
- Canvas: prioritize zoom, pan, selection, keyboard movement, portable exports, and clear save/write options before richer shape libraries.
- Local folder: choose/open/reveal actions should support file-backed creation and navigation, not turn the app into a folder-first shell.
- Settings/help: explain local storage, default folder, memory/binary constraints, and sync as a future layer.

## Non-goals for Phase 1

- No cloud sync UI beyond planning language.
- No Chromium-scale drawing/editor dependency.
- No image-heavy theme packs.
- No hidden database as source of truth. Indexes and caches must be rebuildable from local files.
