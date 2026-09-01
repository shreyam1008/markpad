# Markpad Design System

This document is a build contract, not a mood board. Read it before changing any visible frontend. Markpad should feel like a precise native workbench: quiet surfaces, obvious state, stable geometry, immediate response, and no decorative weight.

## Source of truth

`frontend/src/design/tokens.css` owns every product color, type scale, spacing value, radius, rail dimension, motion duration, shadow, and syntax role. Tailwind's theme maps to those same semantic variables. New components must use semantic Tailwind utilities or `var(--mp-*)`; never introduce a second palette.

`frontend/src/styles.css` owns shared components and layout. React components own structure and behavior. Inline styles are reserved for values that are truly dynamic, such as user-controlled split width or pointer coordinates.

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
| Command palette   | `--mp-command-width`           | 680 px maximum; fixed search/results/footer grid |
| Icon action       | `--mp-control-height`          | 28 px square unless explicitly documented        |

Buttons use four visual roles: quiet icon, quiet text, primary, and danger. Selected segmented controls use the selected token set. Do not invent per-feature variants when one of these roles fits.

Dialogs use one geometry family: a tokenized overlay, an 8 px raised surface, a 20 px content inset, and 8 px action gaps. Short confirmations are 400 px wide and keep actions in stable equal columns; narrow windows stack them without clipping. Every modal must declare `dialog` or `alertdialog`, an accessible title, and a visible focus state. Never join adjacent action borders or let button labels determine the dialog width.

Modal overlays use viewport-fixed grid centering; native `<dialog>` positioning must be reset with `position: relative` and `inset: auto`. Dialogs remain centered in both axes until their content approaches the viewport edge, then the overlay scrolls without clipping the header or actions.

## Window chrome

Markpad uses Wails frameless mode with a custom 36 px title bar. `.app-titlebar` is the drag region; `.app-titlebar-controls` is explicitly non-draggable. Minimize, maximize/restore, and close controls always reserve 46 px each. Double-clicking empty title-bar space toggles maximize. Every close source must go through Wails so the unsaved-document guard runs. That guard cancels the native close and emits `app:quit-requested`; React owns the resulting Markpad alert dialog. Never use an operating-system message box for an unsaved-close confirmation.

App-level surfaces belong in `.app-titlebar-actions`: Files, Search, History, Settings, and More. They remain non-draggable, expose a persistent selected state while their surface is open, and collapse to icons at compact widths. Creation, Open, Save, view mode, undo, and other file/document actions stay in the sidebar, document rail, or command palette. Never duplicate those actions in both chrome levels.

The Wails background color must match `chrome` to prevent a white startup flash. Do not hide, delay, or animate the title bar during boot or hydration. The error screen must retain working window controls.

## Transient navigation and inspectors

- Menus close on outside pointer press and Escape; opening a second transient surface closes the first.
- Pointer-positioned menus use viewport coordinates, measure once before paint, and clamp every edge to an 8 px viewport gutter. Never render a context menu from raw `clientX`/`clientY` alone. Oversized menus scroll internally, and any window resize or ancestor scroll dismisses them so they cannot become detached from their target.
- The command palette uses one visible active option. Hover is deliberately weaker than keyboard selection, results have stable section labels, and its footer owns a fixed grid row so it cannot cover results. Filename search matches visible names and paths only; labels such as `Current file` are presentation metadata, never hidden search keywords. Files and More open explicit file-only and action-only scopes so their labels predict their results.
- History is an overlay inspector. Its loading, empty, timeline, version-loading, error, and diff states all occupy the same final bounds. Every version shows relative time plus a precise timestamp, and Restore is the only primary action. Selected versions use a visible Back control, saved-to-current direction, stable line-number gutters, and Git-style addition/deletion colors and totals.
- Async lists and previews ignore stale responses after the selected document or version changes.

## Syntax highlighting

Markpad owns the Highlight.js presentation in `styles.css`; do not import a stock Highlight.js theme. Syntax roles live in `tokens.css`, and code surfaces use the code surface, code font, stable tab size, a boundary, and a selection-colored leading rule.

Highlighting remains capped at 200,000 characters and 2,000 lines. Styling work must not weaken escaping, DOM sanitization, or those performance limits.

## Modern Markdown and diagrams

Marked owns CommonMark and GFM parsing: headings, emphasis, strike-through, autolinks, reference links, lists, task lists, tables, blockquotes, images, inline code, and fenced code. DOMPurify remains the mandatory boundary for generated HTML.

Fenced `mermaid` blocks render through the bundled Mermaid runtime in strict security mode. Mermaid is dynamically imported only when a document contains a diagram; ordinary notes must not load it. Diagram source is capped at 50,000 characters and 500 edges. Invalid or oversized diagrams keep their source visible inside a clear error surface. Diagram colors and typography come from semantic `--mp-*` tokens, never a separate theme or remote asset.

## Assets and icons

- Functional interface icons come from `frontend/src/components/icons.tsx`, which performs direct Lucide node imports for tree-shaking.
- `packaging/linux/markpad.svg` is the canonical Markpad product mark. `frontend/src/assets/markpad-mark.svg`, the document favicon, Windows ICO/resource, macOS ICNS, Linux desktop icon, installers, and shortcuts must all show that same mark. Run the icon generator and regenerate Windows resources for a brand change; never ship a local `go build` without the checked-in Windows resource object.
- SVG is preferred for small interface and brand assets. Raster assets require a reason and an explicit size check.
- No remote images, web fonts, CDN assets, base64 blobs, random inline SVGs in feature components, or decorative stock imagery.
- Every asset ships locally and must keep Markpad operational with no network.

## Tailwind and CSS rules

- Semantic utilities such as `bg-surface`, `text-muted`, `border-border`, and `text-accent` are allowed because they map to tokens.
- Arbitrary color utilities and raw color values are forbidden in new or modified components.
- Arbitrary dimensions are allowed only for genuinely one-off content constraints, never for permanent shell geometry.
- Do not add a component suite, CSS-in-JS runtime, general state manager, animation package, or icon package.
- Legacy CSS above the `Markpad Workbench` section is compatibility code, not a pattern for new work.

## Performance and loading

Markpad is a Wails application targeting the operating system webview. Keep the release binary under the 16 MiB budget in `BUNDLE_BUDGET.md`. Full Mermaid support is code-split and must not enter the baseline startup path.

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
6. Build the production binary and verify the 16 MiB budget and offline asset scan.
