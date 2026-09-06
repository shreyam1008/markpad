# Quillpane Design System

This document is a build contract, not a mood board. Read it before changing any visible frontend. Quillpane should feel like a precise native workbench: quiet surfaces, obvious state, stable geometry, immediate response, and no decorative weight.

## Source of truth

`frontend/src/design/tokens.css` owns every product color, type scale, spacing value, radius, rail dimension, motion duration, shadow, and syntax role. Tailwind's theme maps to those same semantic variables. New components must use semantic Tailwind utilities or `var(--mp-*)`; never introduce a second palette.

`frontend/src/styles.css` owns shared components and layout. React components own structure and behavior. Inline styles are reserved for values that are truly dynamic, such as user-controlled split width or pointer coordinates.

`frontend/src/preferences.ts` owns the versioned settings schema, validation, legacy zoom migration, persistence, System-mode subscription, and root data attributes. The tiny blocking bootstrap in `frontend/index.html` resolves saved mode and palette before CSS or React can paint; `main.tsx` then applies the validated full schema. Keep the bootstrap allowlists synchronized with the schema so the native webview never flashes the wrong theme.

`frontend/src/shortcuts.ts` owns global shortcut bindings, action identifiers, names, descriptions, groups, and platform-aware labels. TanStack Hotkeys registers that catalog and exposes its live metadata to Settings. Wails native menu events, the React hotkeys, command-palette labels, visible help, and Settings must route through the same `actionsRef` callbacks; never add another app-wide manual key map.

## Visual hierarchy

The permanent surface stack is:

1. `canvas` behind the app
2. `chrome` for the title bar, command rail, and status rail
3. `sidebar` for navigation
4. `paper` for preview and ordinary content
5. `editor` for editable content
6. `raised` only for menus and dialogs

Do not add gradients, glass, backdrop blur, ornamental illustrations, or card grids to the workbench. Borders separate permanent regions; shadow is reserved for temporary elevated surfaces.

## Color and state

- Body text uses `ink` or `text`. Secondary copy uses `muted`; `faint` is only for placeholders and low-priority metadata.
- Selection must be visible without hover: selected background, selected border, accent indicator, and selected text are a coordinated set.
- Hover may never look stronger than selection.
- Focus uses the focus token and remains visible on every interactive control. Never remove an outline without an equally strong replacement.
- Danger, warning, success, and info colors communicate status only. They are not decoration.
- State cannot depend on color alone: retain text, icons, borders, or `aria-current` as a second signal.
- Aim for at least 4.5:1 contrast for ordinary text and 3:1 for controls, focus indicators, and large text.
- Every color theme is a paired light/dark semantic palette. A new theme must define the whole workbench—surfaces, boundaries, interaction, focus, status, syntax, overlay, and diagram roles—not a lone accent color.
- `System` is a mode, not a palette. It follows `prefers-color-scheme` live while preserving the selected palette.

## No-layout-shift law

The shell must not move when a file becomes dirty, a button becomes active, history opens, controls appear, or content loads.

- Title bar, document rail, format rail, status bar, sidebar, and icon controls use the fixed geometry tokens.
- Reserve space for persistent actions. If space is limited, move low-priority actions to overflow; do not let adjacent controls jump.
- Use `min-width: 0` and truncation for variable labels. Never let a file name resize the surrounding rail.
- State changes may alter paint, opacity, or transform. They may not animate width, height, margin, padding, grid tracks, or pane size.
- Never use `transition: all`.
- Split panes and resize dividers do not animate.
- Loading states occupy the final component bounds. Do not insert temporary rows above existing content.
- Changing font weight must not change a control's allocated dimensions.

## Motion and response

Motion communicates direct manipulation; it does not decorate idle UI. Use the fast, standard, or slow motion tokens (80–160 ms) with the shared easing curve. Allowed transition properties are `background-color`, `border-color`, `color`, `opacity`, and `transform`. Respect `prefers-reduced-motion`.

Avoid timers, looping animations, layout measurement loops, and broad React rerenders. Keep window and editor actions synchronous from the user's perspective, and do not add dependencies for effects CSS can perform.

## Component geometry

| Region            | Token                          | Contract                                         |
| ----------------- | ------------------------------ | ------------------------------------------------ |
| App title bar     | `--mp-titlebar-height`         | 36 px, fixed, draggable except controls          |
| Document rail     | `--mp-document-rail-height`    | 42 px, fixed                                     |
| Format rail       | `--mp-format-rail-height`      | 34 px, fixed when present                        |
| Status rail       | `--mp-status-height`           | 26 px, fixed                                     |
| Sidebar           | `--mp-sidebar-width`           | 244 px default; responsive token overrides only  |
| Collapsed sidebar | `--mp-sidebar-collapsed-width` | 44 px fixed                                      |
| History inspector | `--mp-history-width`           | 304 px overlay; never resizes the document       |
| Settings inspector| `--mp-settings-width`          | 544 px overlay; absent from layout when closed   |
| Command palette   | `--mp-command-width`           | 680 px maximum; fixed search/results/footer grid |
| Icon action       | `--mp-control-height`          | 28 px square unless explicitly documented        |

Buttons use four visual roles: quiet icon, quiet text, primary, and danger. Selected segmented controls use the selected token set. Do not invent per-feature variants when one of these roles fits.

Dialogs use one geometry family: a tokenized overlay, an 8 px raised surface, a 20 px content inset, and 8 px action gaps. Short confirmations are 400 px wide and keep actions in stable equal columns; narrow windows stack them without clipping. Every modal must declare `dialog` or `alertdialog`, an accessible title, and a visible focus state. Never join adjacent action borders or let button labels determine the dialog width.

Modal overlays use viewport-fixed grid centering; native `<dialog>` positioning must be reset with `position: relative` and `inset: auto`. Dialogs remain centered in both axes until their content approaches the viewport edge, then the overlay scrolls without clipping the header or actions.

## Window chrome

Quillpane uses Wails frameless mode with a custom 36 px title bar. `.app-titlebar` is the drag region; `.app-titlebar-controls` is explicitly non-draggable. Minimize, maximize/restore, and close controls always reserve 46 px each. Double-clicking empty title-bar space toggles maximize. Every close source must go through Wails so the unsaved-document guard runs. That guard cancels the native close and emits `app:quit-requested`; React owns the resulting Quillpane alert dialog. Never use an operating-system message box for an unsaved-close confirmation.

Linux must not mount Wails' native GTK application menu: it creates a second `File / Edit / View / Settings / Help` strip above the custom title bar. Retain the application menu for non-Linux platform integration, while Linux uses the title-bar surfaces, command palette, and unified React shortcuts.

Linux also receives a paint-only 1 px outer hairline because frameless WebKitGTK windows do not get the DWM border that Windows supplies. Its custom window-control glyphs render at 14 px for reliable clarity under Linux font and display scaling; the fixed 46 px hit targets and 36 px title-bar geometry remain unchanged.

App-level surfaces belong in `.app-titlebar-actions`: Files, Search, History, Settings, and More. They remain non-draggable, expose a persistent selected state while their surface is open, and collapse to icons at compact widths. Creation, Open, Save, view mode, undo, and other file/document actions stay in the sidebar, document rail, or command palette. Never duplicate those actions in both chrome levels.

The Wails background color must match `chrome` to prevent a white startup flash. Do not hide, delay, or animate the title bar during boot or hydration. The error screen must retain working window controls.

## Transient navigation and inspectors

- Menus close on outside pointer press and Escape; opening a second transient surface closes the first.
- Pointer-positioned menus use viewport coordinates, measure once before paint, and clamp every edge to an 8 px viewport gutter. Never render a context menu from raw `clientX`/`clientY` alone. Oversized menus scroll internally, and any window resize or ancestor scroll dismisses them so they cannot become detached from their target.
- The command palette uses one visible active option. Hover is deliberately weaker than keyboard selection, results have stable section labels, and its footer owns a fixed grid row so it cannot cover results. Filename search matches visible names and paths only; labels such as `Current file` are presentation metadata, never hidden search keywords. Files and More open explicit file-only and action-only scopes so their labels predict their results.
- History is an overlay inspector. Its loading, empty, timeline, version-loading, error, and diff states all occupy the same final bounds. Every version shows relative time plus a precise timestamp, and Restore is the only primary action. Selected versions use a visible Back control, saved-to-current direction, stable line-number gutters, and Git-style addition/deletion colors and totals.
- Settings is an overlay inspector with Appearance, Writing, Keyboard, and Files categories. Changes save automatically, render immediately, and never mutate document content. It is fully unmounted when closed. Opening it closes History, Search, palette, and modal surfaces; Escape closes it.
- Appearance owns System/Light/Dark, paired color themes, UI scale, and reduced motion. Writing owns text size, line spacing, and reading width. Files explains storage and file behavior; it does not masquerade as a preference when no setting exists.
- Keyboard snapshots the live TanStack registrations each time Settings mounts and groups them by task. UI-scale shortcuts, text-size shortcuts, native menu accelerators, command-palette labels, and Ctrl/Cmd+wheel behavior must update the same preference state immediately. Use `Mod` for cross-platform Command/Ctrl behavior and `formatForDisplay` for labels.
- Async lists and previews ignore stale responses after the selected document or version changes.

## Syntax highlighting

Editable source uses CodeMirror 6 with a small semantic theme defined in
`components/CodeEditor.tsx`. The editor owns incremental parsing, selection,
indentation, line numbers, bracket matching, and local scrolling; the parent
workspace remains the authority for drafts and persistence. Source undo/redo
uses CodeMirror's change-based history so large files do not retain a complete
string snapshot for every keystroke; textarea documents keep the bounded app
history. Language
modes are loaded on demand from `@codemirror/legacy-modes`, with the richer
Lezer JavaScript/TypeScript parser loaded only for those files. Unsupported
extensions remain fully editable plain source rather than losing editor
behavior.

Quillpane owns the Highlight.js presentation in `styles.css` for static rendered
code and Markdown fences; do not import a stock Highlight.js theme. Syntax
roles live in `tokens.css`, and both editor and viewer code surfaces consume
the same code font, selection signal, and semantic token roles. TanStack
Highlight is intentionally not used for editing: it returns static HTML and
does not provide editor state or incremental tokenization.

Reading width is a prose preference, not a universal source-view constraint. Markdown follows the selected reading measure. Code expands across the available pane and keeps any exceptionally long line inside its own horizontal scroller. Plain text uses a wider 110-character measure and wraps unbroken content instead of widening the application canvas.

Static Highlight.js rendering remains capped at 200,000 characters and 2,000
lines. CodeMirror editing stays incremental and virtualized for larger source
files. For source documents at or above 256,000 characters, rapid app-history
snapshots are coalesced so typing cannot retain a full-document copy for every
keystroke; the workspace boundary separately caps readable files at 2 MiB.
Styling work must not weaken escaping, DOM sanitization, or the static rendering
limits.

## Modern Markdown and diagrams

Marked owns CommonMark and GFM parsing: headings, emphasis, strike-through, autolinks, reference links, lists, task lists, tables, blockquotes, images, inline code, and fenced code. DOMPurify remains the mandatory boundary for generated HTML.

Markdown source is prose-first: it soft-wraps inside its pane and never creates application-level horizontal overflow. Code remains the only document type with a deliberate horizontal source scroller.

Relative Markdown image paths resolve from the saved note's directory through the native boundary, never through `file://` URLs or a network request. Remote and embedded image URLs retain their sanitized browser behavior. Local images must remain proportionally contained inside the reading column and expose explicit loading and error states. Native reads, distinct-image count, sequential hydration, and the per-note data-URL cache are bounded; preview rerenders prune stale cached sources instead of multiplying requests.

Fenced `mermaid` blocks render through the bundled Mermaid runtime in strict security mode. The renderer is invoked only when a document contains a diagram. The production frontend remains one ES-module entry because split module graphs do not execute reliably from Wails' in-memory scheme on Linux WebKitGTK; do not re-enable `splitting` without a native Linux window test. Diagram source is capped at 50,000 characters and 500 edges. Invalid or oversized diagrams keep their source visible inside a clear error surface. Diagram colors and typography come from semantic `--mp-*` tokens, never a separate theme or remote asset.

Theme changes remount only the preview renderer, not the editor or the document workspace. Mermaid is reinitialized from current semantic tokens for the new preview; an appearance change must never discard unsaved text or reset the editor cursor.

## Assets and icons

- Functional interface icons come from `frontend/src/components/icons.tsx`, which performs direct Lucide node imports for tree-shaking.
- `packaging/linux/markpad.svg` is the frozen Quillpane product mark and retains its legacy filename. `frontend/src/assets/markpad-mark.svg`, the document favicon, Windows ICO/resource, macOS ICNS, Linux desktop icon, installers, and shortcuts must all continue to show that same mark. Do not regenerate logo resources during the name migration; a future logo change is a separate maintainer decision.
- SVG is preferred for small interface and brand assets. Raster assets require a reason and an explicit size check.
- No remote images, web fonts, CDN assets, base64 blobs, random inline SVGs in feature components, or decorative stock imagery.
- Every asset ships locally and must keep Quillpane operational with no network.

## Tailwind and CSS rules

- Semantic utilities such as `bg-surface`, `text-muted`, `border-border`, and `text-accent` are allowed because they map to tokens.
- Arbitrary color utilities and raw color values are forbidden in new or modified components.
- Arbitrary dimensions are allowed only for genuinely one-off content constraints, never for permanent shell geometry.
- Do not add a component suite, CSS-in-JS runtime, general state manager, animation package, or icon package.
- Legacy CSS above the `Quillpane Workbench` section is compatibility code, not a pattern for new work.

## Performance and loading

Quillpane is a Wails application targeting the operating system webview. Keep release binaries under the platform budgets in `BUNDLE_BUDGET.md`. Full Mermaid rendering must remain bounded and offline. The production frontend is intentionally one module for Linux WebKitGTK compatibility.

- No runtime network calls, font downloads, preload splash art, or heavyweight asset decoding.
- Avoid backdrop filters and large blurred shadows.
- Prefer CSS states over JS measurement. Mount small controls near their owner.
- Preserve bounded rendering for large files, stable scrollbar gutters, and content containment.
- A new dependency requires bundle justification and a measured before/after build.

## Before merge

For every visible change:

1. Run the design contract test, frontend tests, typecheck, lint, and formatting check on changed files.
2. Inspect default, selected, hover, focus, disabled, dirty, and error states.
3. Verify current desktop width and a narrow width; controls may simplify but must not jump.
4. Exercise minimize, maximize/restore, title-bar double-click, close, and unsaved-close protection in Wails.
5. Check code, Markdown, plain text, a large-file fallback, split resizing, and reduced motion.
6. Build the production binary and verify its platform budget and offline asset scan.
