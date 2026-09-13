# File badges and shared renderer follow-up

This follow-up builds on the [initial measurements](performance-2026-09.md). It stays in Markpad/Quillpane and keeps the existing Go/Wails/system-WebView stack.

## Changes

- Replaced the pencil/code symbol plus tiny extension with a single 36 × 22 px extension chip. MD, JSON, YML and TXT have consistent alignment, semantic colors and accessible family labels. The shared component updates sidebar and file-search badges. Filename, selection and dirty-state behavior remain intact.
- Large code/config previews now use the same newline-aligned text blocks as large text previews. This avoids constructing an escaped HTML copy and laying out one giant `pre`. Text remains selectable, code width stays wide, and text zoom continues to work. CodeMirror editing is unchanged.
- Highlight.js grammars initialize on first actual highlighting instead of on every app startup, on both platforms. The existing 200,000-character/2,000-line limits remain exact; checking them no longer creates a line array. Ordinary notes and oversized code do not initialize the grammars.

## Evidence

Windows WebView2 Edg/152.0.4191.66, fresh isolated profiles, identical main workload sequence. A 1,350,011-byte JSON fixture measured **257.9 → 216.7 MiB** private committed memory after explicit JS GC. That is a **41.2 MiB** reduction in this comparison, not a measured peak or a Linux prediction. JS heap at that point measured 15.86 → 13.54 MiB. Earlier follow-up trials were about 211–217 MiB after the change.

Both builds retained the exact JSON text in the DOM. Native rendered selection retained all content except the terminal newline, which WebView2 omits in both builds; the optimization did not change that existing browser behavior. Text zoom/reset passed on the large-code preview. Small JSON and YAML still highlighted correctly after deferred initialization. Native screenshots were inspected at 1180 px in light and dark themes, and at a simulated 720 px viewport in the actual WebView2 host. Extension labels did not overflow; names truncated as before.

Passed: 71 frontend tests, type checking, lint (existing warnings), formatting, canonical Go tests, Windows and Linux-target frontend builds. A separate canonical native regression run passed draft persistence, undo/redo, exact saving, external-save conflict protection, large-text selection, and Mermaid rendering. No runtime exceptions were captured in the successful runs. [Compact evidence](performance-followup-2026-09.json) includes the measured values and checks. Native fixture/screenshot generator: `dist/performance/prepare-badge-qa.py` derives the isolated checks from `.github/scripts/benchmark-windows.mjs`; local PNGs are in `dist/performance/badges-*.png`.

The current stripped Windows executable is 18,753,536 bytes (17.88 MiB), SHA-256 `4fcbcf35a8b0ed2c95794f672de6267c2b53e8d961945b95558d2137bcb525e0`. Prior build hashes and timings in the initial report describe that earlier candidate. This follow-up was not published.

## Windows and Linux

The new badge, grammar initialization, syntax-boundary and large-code paths are shared. Linux avoids the same application-level work. Its system WebKitGTK engine, allocator and text layout can give different absolute RAM and latency results; no reliable numeric Linux estimate follows from a Windows private-bytes snapshot. Browsers that do not support offscreen containment still display the entire document, with less opportunity to skip layout.

Linux's single-module frontend build passed, retaining the proven WebKitGTK loading structure. Native Linux RAM/startup is still unmeasured; Windows-only Mermaid script deferral was not enabled there. Heavy rich-Markdown DOM, very long unbroken lines, and the 2 MiB editable-file boundary remain the next larger performance work. This pass does not claim the stack has reached a memory floor.
