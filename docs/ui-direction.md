# Markpad UI direction

Markpad should feel like a fast local workbench, not a heavy web app. The visual system should reinforce that: compact, calm, textured, and precise, with enough polish that the app feels finished without adding image-heavy assets or runtime dependencies.

## Product feel

- Local-first: every surface should make it clear that files, tasks, trash, search, and canvas data stay on the machine.
- Workbench, not IDE clone: keep the sidebar and split view, but avoid tab overload. Prefer source chips, command actions, and lightweight modals over persistent chrome.
- Dense but readable: show useful status and controls, but keep typography small, high-contrast, and grouped.
- Fast feedback: command palette actions should update status text immediately. Long-running local operations should report counts, scope, and completion.

## Layout direction

- Sidebar: file/source navigation with visible recents, favorites, local folder actions, and compact badges.
- Center: editor/preview split remains the primary mode, with presets for writing, review, and preview-heavy reading.
- Bottom/status: practical local stats: file type, line/word/selection, cursor, read time, memory, and binary/runtime diagnostics.
- Overlays: search, commands, tasks, trash, settings, and canvas should share focused modal treatment with strong keyboard access.

## Visual language

- Themes: CSS-variable themes only. Keep Paper/Linen/Dawn/Mist for light work and Ink/Pine/Slate/Ember for dark work.
- Texture: use subtle borders, inset highlights, and shadows from variables instead of raster backgrounds.
- Icons: prefer inline SVG or short text glyphs. No bundled icon packs unless a tiny curated subset is hand-inlined.
- Motion: small lift/focus effects only, with reduced-motion support.

## Feature-specific polish

- Search: keep source scopes visible, show operator hints, highlight matches, and make result source counts obvious.
- Tasks: one Markdown task source, multiple views. List/calendar/kanban should feel like filters over files, not a separate database.
- Trash: show retention state clearly, keep cleanup explicit, and avoid hiding permanent delete behind ambiguous language.
- Canvas: prioritize zoom, pan, selection, keyboard movement, portable exports, and clear save/write options before richer shape libraries.
- Settings/help: explain local storage, default folder, memory/binary constraints, and sync as a future layer.

## Non-goals for Phase 1

- No cloud sync UI beyond planning language.
- No Chromium-scale drawing/editor dependency.
- No image-heavy theme packs.
- No hidden database as source of truth. Indexes and caches must be rebuildable from local files.
