# Quillpane performance â€” 2026-09-12

This is work in `markpad`, branded Quillpane. It does not use ProtoPeek measurements. Baseline: commit `7c6fc82`, existing dependencies, Go 1.27.0 and Bun 1.4.0. Candidate: Go 1.27.1, Bun 1.4.2, upgraded packages and the renderer changes described below. No release or publication was performed; version remains 0.13.8.

## Results on this Windows machine

Private committed memory across the Go host and the dedicated WebView2 process tree, in MiB. These are settled snapshots after explicit JavaScript garbage collection, not peak RAM or Task Manager's private working set.

| Workload | Before | After |
|---|---:|---:|
| Small Markdown note | 185.9 | 167.5 |
| 2 MiB plain text, 69,906 lines | 249.9 | 182.8 |
| 998 KiB Markdown, 14,000 headings | 375.2 | 373.7 |
| First diagram, after previous workloads | 203.1 | 224.2 |

Without forced collection, the 2 MiB text snapshots were 310.0 â†’ 189.0 MiB. The rich-Markdown snapshots were 525.9 â†’ 471.9 MiB. These snapshots do not establish a peak-memory bound. Repeated development runs varied: small-note settled memory was about 186â€“189 MiB before and 166â€“168 MiB after; large-text settled memory was about 250â€“255 MiB before and 181â€“183 MiB after.

Five alternating launches per build, each with a fresh app/WebView profile and warm OS file cache: median launch-to-first-contentful-paint **684 â†’ 553 ms**. Ranges: 665â€“728 ms before, 529â€“559 ms after. This is an initial-paint metric, not cold-boot performance or proof every control is ready. CDP discovery/readiness timings are separate and include polling overhead. WebView2 was Edg/152.0.4191.66; the OS still supplies the engine.

Observed open-to-render checks, one run each, include bridge calls, up to 100 ms polling, and two animation frames: small.md 131 â†’ 134 ms; large.txt 280 â†’ 155 ms; large.md 1062 â†’ 1053 ms; diagram.md 215 â†’ 427 ms. These are smoke timings, not statistically established latency improvements. First-diagram loading is slower and retains more memory with Mermaid 12; the startup reduction has that tradeoff.

## What changed

- Windows loads Mermaid's embedded classic script only when opening a diagram. Initial JS falls from 4,622,285 to 1,191,769 bytes. The separate diagram script is 5,365,297 bytes. Nothing is fetched from a CDN. Linux/macOS keep the proven single-module build; native Linux split-module compatibility has not been established.
- Large plain-text previews use newline-aligned blocks with `content-visibility`, allowing the engine to skip offscreen layout. Placeholder heights use each block's actual line count instead of a fixed small guess. The entire document stays in the DOM and scrolls continuously. A native full-range selection matched every character of the 2 MiB fixture; its scroll extent changed by less than 1% after jumping to the end. Wrapped lines may still change estimated heights. Browsers without containment support fall back to laying out the full text.
- Word counts and heading scans avoid arrays of every word/line. Find retains the next position and total count instead of a million-entry match array. Line navigation scans offsets without splitting the document. Search semantics and bounded edit history remain unchanged.
- All 23 direct frontend/build packages match npm's stable `latest` tags at the audit. Go and runtime dependencies were updated; no browser engine, Node, Bun, or `node_modules` is included in the app.
- The owner removed hard binary-size ceilings. CI and Make now report size while preserving the offline-assets and correctness checks.

## Build measurements

Stripped Windows executable: **16,792,576 â†’ 18,753,536 bytes** (16.01 â†’ 17.88 MiB). Candidate SHA-256: `eb8aee5cc1aaf77472c84b114e3d3ebf1e4303c7463788efd18babfec5dd649b`. This local executable is not a signed installer/store artifact.

Warm-cache final builds on this Windows machine: type-check plus Windows frontend 0.78 s; Linux-target frontend 0.87 s; stripped Go executable 1.31 s. No comparable baseline build-time series was recorded. Bun's native bundler and TypeScript 7's existing native compiler are retained; there is no reason to add a second bundler or preview compiler. PGO has not been enabled without a representative profile.

Linux-target frontend: one 6,539,724-byte JS entry and 124,045 bytes CSS. Windows CSS: 122,898 bytes. Bun 1.4.2 output is embedded by Go. Platform-specific frontend builds must set `QUILLPANE_BUILD_PLATFORM=linux` or `win32` when the build host differs from the target; native CI jobs select it automatically.

## Verification and reproduction

Passed: frozen Bun install; `bun outdated` with no direct-package updates; TypeScript, 70 frontend tests, lint (existing warnings, no errors), formatting; canonical Go tests and vet; release-version consistency; production Windows build; Linux-target frontend build. Native Windows: Markdown, large plain-text full selection, Mermaid 12 rendering, draft persistence, undo/redo, exact save, external modification conflict without overwriting disk, and zero captured runtime exceptions. Runtime asset requests were all to Wails' local origin.

The machine has no `make`, WSL or local Linux GTK runtime. The remote Linux host's SSH connection timed out. Native Linux build/startup/RAM, long-session leak behavior, and signed packaging are **unverified**. The existing Linux rendered-window CI smoke test remains enabled; a frontend build is not a native Linux pass.

Run from the repository root after a production Windows frontend build:

```powershell
python .github/scripts/build-performance-windows.py
bun .github/scripts/benchmark-windows.mjs dist/performance/quillpane-profile.exe dist/performance/native.json
# For repeated startup measurements:
$env:QUILLPANE_PERF_STARTUP_ONLY = '1'
bun .github/scripts/benchmark-windows.mjs dist/performance/quillpane-profile.exe dist/performance/startup.json
```

The profiling builder copies the existing WebView2 module into ignored `dist/performance`, enables localhost CDP only in that copy, and uses a separate modfile. It never patches the application source or shared module cache. The benchmark uses temporary app profiles and generated fixture files, and shuts down only its own app. **Do not distribute profiling executables**: normal release builds omit the debugging port. [Compact raw evidence](performance-2026-09.json) records individual trials and snapshots. Fixtures and screenshots remain in the printed temporary profile directories for review.

## Remaining work and the performance floor

There is no evidence that this stack has reached its minimum RAM. WebView2 is still the main baseline cost. Full Mermaid 12 initialization costs more than Mermaid 11; deferred loading helps ordinary reading but does not unload the runtime after use. A single extremely long unbroken text line remains one layout block.

The stress Markdown creates 70,221 DOM elements, including 14,000 outline items. Its retained memory remains high and its open time is essentially unchanged. A future bounded-DOM renderer/outline needs explicit preservation of selection/copy, find, anchors, variable-height scrolling, accessibility and split sync. It is not safe to claim `content-visibility` eliminates all DOM storage.

The existing 2 MiB editable-file boundary remains; removing the **binary size ceiling** did not make arbitrary-size files supported. Large Markdown/text still use textarea editing with bounded snapshots. Supporting tens or hundreds of MiB needs a separate file/viewport model and native tests, rather than merely increasing the read limit. Image, highlight, saved-history and external-save protections remain intact. Linux JIT and Go GC settings were left unchanged pending native measurements.
