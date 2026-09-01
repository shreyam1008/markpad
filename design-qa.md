# Markpad visual QA — workbench, overlays, product icon, and quit guard

## Evidence

- Source visual truth:
  - `C:\Users\shreyam\AppData\Local\Temp\codex-clipboard-ab30e52f-6e22-4faa-8a19-659257b80eeb.png` — 1141 × 769 px, context-menu placement state.
  - `C:\Users\shreyam\AppData\Local\Temp\codex-clipboard-4187263c-1a1d-45af-b682-073e78ca5205.png` — 954 × 655 px, Windows taskbar icon state.
  - `C:\Users\shreyam\AppData\Local\Temp\codex-clipboard-836a9186-2619-4f09-8d41-b35791911627.png` — 1118 × 830 px, File information dialog state.
  - `C:\Users\shreyam\AppData\Local\Temp\codex-clipboard-7afaf8df-8ead-445a-b1db-5089158ef02b.png` — native Windows unsaved-close warning over Markpad.
- Accepted implementation screenshots:
  - `C:\Users\shreyam\AppData\Local\Temp\markpad-visual-audit-20260901\01-baseline.jpg` — 1180 × 760 px rebuilt workbench baseline.
  - `C:\Users\shreyam\AppData\Local\Temp\markpad-visual-audit-20260901\02-file-info-centered.jpg` — 1180 × 760 px rebuilt centered File information dialog.
- Latest quit-dialog screenshot: unavailable. A fresh Windows Computer Use capture failed both permitted recovery attempts (`GetCursorPos` access denied, followed by a Windows Graphics Capture monitor failure), and the in-app browser rejected the localhost preview under its URL policy.
- Implementation asset evidence: `C:\Users\shreyam\AppData\Local\Temp\markpad-exe-icon.png` — 32 × 32 px icon extracted from the rebuilt `dist\markpad.exe`.
- CSS viewport: source screenshots reflect 1141 × 769 and 1118 × 830 logical-pixel app states. A same-state implementation viewport could not be captured.
- Density normalization: none. Source screenshots and extracted icon were inspected at their native pixel dimensions; there is no valid same-size UI comparison without an implementation capture.

## Full-view comparison evidence

The rebuilt baseline preserves the fixed title bar, document rail, toolbar, sidebar, editor, and status geometry without visible shift. The rebuilt File information dialog is centered on both axes with a balanced overlay and no clipped content. The latest source capture still proves the old app-close path was inconsistent because it placed a native Windows message box above the Markpad modal system; the new in-app quit dialog is implemented and contract-tested but lacks a rendered after capture.

## Focused-region comparison evidence

- Product icon: the Windows executable now exposes the same green paper/check Markpad mark used by the canonical Linux SVG and the frontend SVG/favicon. The extracted 32 px resource is sharp and identifiable.
- Context menu: clamped by implementation and geometry tests; no accepted post-fix corner capture.
- File information dialog: passed in the accepted centered screenshot.
- Unsaved app quit: old native message box is captured; new Markpad alert dialog lacks a post-fix screenshot.

## Findings

- [P2] Post-fix menu placement remains visually unverified.
  - Location: sidebar note context menu.
  - Evidence: the source shows incorrect placement; the implementation now measures before paint and clamps to an 8 px viewport gutter, with unit coverage for normal, edge, and undersized viewports, but no after screenshot exists.
  - Impact: without a rendered comparison, Windows scaling or WebView-specific behavior could still produce an offset.
  - Fix: capture right-click states at all four viewport corners in the rebuilt Wails app when Windows capture is available.
- [P1] Post-fix app-quit dialog remains visually unverified.
  - Location: application close with one or more dirty documents.
  - Evidence: the source capture shows a native Windows Yes/No message box. The backend now cancels every dirty close source, emits `app:quit-requested`, and React renders one tokenized `alertdialog` with Cancel and Quit Without Saving actions; tests pass, but no after screenshot exists.
  - Impact: behavior is covered, but WebView-specific spacing, focus, and stacking cannot be signed off visually yet.
  - Fix: capture the rebuilt dialog once Windows Graphics Capture is available.

## Required fidelity surfaces

- Fonts and typography: unchanged by this patch; no post-fix visual regression evidence available.
- Spacing and layout rhythm: menu gutter and modal centering are now tokenized/deterministic, but remain capture-blocked.
- Colors and visual tokens: unchanged; menu/dialog surfaces continue to use semantic Markpad tokens.
- Image quality and asset fidelity: passed for the extracted Windows executable icon; the frontend SVG, favicon, Linux SVG, Windows ICO/resources, and macOS ICNS are governed by one asset contract.
- Copy and content: unchanged.

## Comparison history

1. Source findings: raw context-menu placement, left-anchored native dialog, and inconsistent Windows executable branding.
2. Fixes made: pre-paint viewport clamping; viewport-fixed grid centering with native dialog position reset; canonical mark synchronization and checked-in Windows resources; native unsaved-close prompt replaced by one app-owned Wails/React quit flow.
3. Post-fix evidence: rebuilt baseline and centered modal screenshots, unit/contract tests, native icon extraction, release build, and warm process-tree measurement. The quit dialog still needs one rendered after capture.

## Implementation checklist

- [x] Clamp context menus to every viewport edge before paint.
- [x] Dismiss detached menus on resize and scroll.
- [x] Center native dialogs in the viewport and constrain short windows.
- [x] Synchronize the product mark across frontend and packaging.
- [x] Embed Windows resources in ordinary local builds.
- [x] Test geometry, brand assets, metadata, frontend behavior, Go backend, and binary size.
- [x] Replace the native Windows unsaved-close message with the Markpad alert dialog for title-bar, menu, Alt+F4, and taskbar close paths.
- [ ] Capture and compare the rebuilt quit dialog and edge-positioned context menu when Windows capture is available.

final result: blocked
