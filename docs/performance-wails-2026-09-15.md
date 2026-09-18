# Wails rendering optimization — 2026-09-15

This experiment stays in Quillpane's Go/Wails/React frontend. The Flutter port is unchanged. Source base: `258bad98a257d747e9b36a7a0d8e5fe1b4f73d4a` (0.14.3), local branch `perf/wails-rendering`. These are working-tree builds, not a published release or an exact-commit CI pass.

## What changed

- Large Markdown is parsed and sanitized as one document, then complete top-level DOM nodes are grouped in sections of 64. Offscreen sections can skip layout/paint. Every node remains present for selection, links and accessibility. Small previews keep their original path. This is rendering containment, not removal of offscreen text.
- Highlighted code preserves whole-file lexing before grouping output into 64-line blocks. Span scopes and text survive boundaries. Small files, unsupported variable-width/control text, standalone CR, and existing highlight-limit fallbacks retain their original layout.
- Outlines above 512 headings retain all buttons in groups of 64, with offscreen containment. Smaller outlines remain flat.
- The frontend serializes draft/position writes and only acknowledges successful persistence. An unchanged clean flush makes zero draft/position bridge calls. Edits arriving during a write are drained; edits arriving during Save remain dirty. Failed recovery writes stay retryable and display a status.
- Go avoids atomic replacement when the persisted session/draft bytes already match, comparing drafts with a 4 KiB buffer instead of retaining full content caches.
- Closed tag pickers avoid computing options; task color styles use a bounded weak-key cache. History reuses a lazily created date formatter.

No rendering framework, production dependency, file-size limit, task limit, undo limit, or highlighting limit changed. `happy-dom` is an exact-pinned development-only dependency for real DOM sanitization and workspace race regressions. It contributes no embedded runtime code.

## Paired full-process measurements

Windows 11 under Remote Desktop, WebView2 152.0.4191.66, about 16 GiB RAM/8 vCPUs. Fresh isolated profiles, identical fixture hashes, production executables, no CDP debugger or forced GC. Each case has two baseline and two candidate launches, with order reversed on repeat two. Each measurement lasts 15 seconds; the final five seconds supply the per-run median. Sampling interval is approximately 100 ms.

Baseline executable SHA-256: `c1505fdc2a29f8f18012bb29d4c5d2146f1cdf5d8e4ba853a3255d6cd43289eb` (18,835,968 bytes).

Measured rendering candidate SHA-256: `13bcf8b99318dd6238c95003ce778e9f3430e4d919be97c9c2029998ab6bb3ca` (18,846,720 bytes). The full matrix predates the final recovery-error/recovery-repair and standalone-CR guards; final-build follow-up evidence is recorded separately below.

The audit passed 48 trials and 7,176 samples: complete process trees, no missing counters, monotonic sample times, matching artifacts and fixture hashes, and recomputed medians. Processes include the Go host plus WebView2 browser, renderer, GPU and utilities, usually seven processes. One earlier baseline attempt had an access-denied observation during child-process cleanup; it is excluded and preserved, with a fresh replacement trial. No collector checks were suppressed.

**Private resident memory is not total app RAM.** It counts private pages currently resident across the entire process tree. Private commit includes nonresident committed pages. Summing full working sets double-counts shared pages. An earlier PSS estimator failed calibration and is not used here. GPU-memory counters under this remote session are not a physical-GPU comparison.

Table values are MiB. Resident shows the range of the two run medians; commit is their median; peak is the largest observed private-resident sample.

| Workload | Baseline resident | Candidate resident | Commit before → after | Peak before → after |
|---|---:|---:|---:|---:|
| 100-line prose | 86.5–86.5 | 85.3–118.6 | 170.0 → 169.8 | 92.4 → 124.9 |
| 100-line rich Markdown | 91.4–91.6 | 91.9–93.4 | 174.5 → 175.8 | 97.3 → 99.6 |
| 14,000 headings (1.02 MB Markdown) | 631.3–634.9 | 227.1–234.9 | 721.8 → 318.0 | 713.0 → 244.6 |
| 1,106-line highlighted TypeScript | 283.4–288.6 | 125.2–125.7 | 371.3 → 209.7 | 328.1 → 135.5 |
| 100-line Markdown with code | 97.7–98.0 | 94.8–98.4 | 181.8 → 180.6 | 105.9 → 104.1 |
| 1,000-line rich Markdown | 99.5–100.6 | 99.5–101.2 | 183.4 → 184.0 | 108.6 → 109.1 |
| 5,000-line rich Markdown | 124.9–126.3 | 119.1–120.8 | 209.4 → 203.5 | 141.3 → 131.4 |
| 1 MiB single Markdown paragraph | 220.1–221.8 | 220.5–220.6 | 309.8 → 310.0 | 277.9 → 287.5 |
| Large plain text | 102.4–105.5 | 102.7–102.7 | 188.1 → 187.1 | 108.2 → 108.7 |
| Large JSON (plain fallback) | 98.0–98.2 | 97.5–99.2 | 181.6 → 182.1 | 103.2 → 104.3 |
| 500-task board | 227.1–227.7 | 226.7–227.8 | 314.0 → 314.1 | 251.3 → 251.5 |
| 2048 x 1536 image | 80.9–82.5 | 82.6–84.9 | 166.4 → 168.6 | 89.2 → 89.8 |

Post-cleanup isolated profile sizes range from 3.59 to 67.60 MiB in both builds (median about 4.00 MiB across these cases). This includes local recovery/history and WebView profile/cache data; it is not the installed executable size. The measured executable grows by 10,752 bytes, about 10.5 KiB.

The strongest repeated changes are the heading-heavy Markdown case (about 63% less private resident memory) and highlighted TypeScript (about 56% less). The 100-line rich-note case is essentially unchanged. The first prose candidate run had higher residency (118.6 MiB) despite commit staying near 170 MiB; the second was 85.3 MiB. Both are retained. This sample size does not establish a small-note improvement, and single-paragraph peak memory did not improve.

## Limits and remaining opportunities

These changes remove large-document layout overhead; they do not establish a minimum possible Wails footprint. Full Markdown parsing/sanitization, the complete DOM, and the outline array still exist. A single giant paragraph does not benefit from section grouping. The 500-card board remains near its earlier memory use; collapsing columns already unmounts their cards. More aggressive card virtualization requires separate drag/drop and variable-height verification.

The design follows [CSS content-visibility](https://drafts.csswg.org/css-contain-2/#content-visibility) and uses memoization narrowly, following [React's memo guidance](https://react.dev/reference/react/memo). [React Doctor](https://github.com/millionco/react-doctor) ran read-only with telemetry disabled: 66 findings before, 65 after (performance findings 16 → 15). Existing refs/effect/accessibility findings remain; this is not a clean Doctor report. Suggestions that would undermine bounded image work or Linux's single-module bundle were not applied blindly.

Raw local evidence and tools are under `temp/PORT/build/benchmark-2026-09-15/round2`; that historical directory name does not mean this pass modifies or benchmarks Flutter. `opt_compare.py`, `collect.py`, `variants.py`, `drive_sequence.py`, and `audit_optimization.py` describe the reproducible workload and counter checks. Full-matrix source hashes are in `optimized-source.json`; raw trials are immutable.

## Final build and native checks

The final production executable is `optimized-final.exe`, SHA-256 `ba848e1c592a2082ef052739892cc86b4defd3a3e15ef425362cc73467df7867`, 18,852,352 bytes. It adds visible recovery-error handling, a standalone-CR layout fallback, and repair of missing recovery files before acknowledgement/activation. Existing dirty recovery is never replaced; source fingerprints are retained. Failed activation leaves the previous document active. Healthy activation adds a recovery-file open/stat/close, not a full-file read or rewrite. Final source hashes are in `final-source.json` (manifest SHA-256 `2bd2d6ee613b581f983f0b77540b1bf16f5febd121d23e6b49865e8fa077cbd1`).

On this exact Windows executable, native Computer Use verified:

- Large Markdown rendering; scrolling the 14,000-heading outline and navigating into the final portion of the document (persisted cursor 1,007,035).
- Highlighted code scrolling and selection across the first 64-line boundary. Native copy/paste produced a 359-character exact contiguous match in the source, without an inserted boundary newline.
- Pasting into a disposable note, switching to another Markdown file, and returning preserved dirty text and reading position. The saved source file's original hash was unchanged.
- Saved-version history loaded its timestamps and diff, then closed without replacing the current edit.
- The 500-card task board, deferred tag picker, tag selection and recovery persistence, Escape focus restoration, and light/dark colors.

Visual checks used an isolated profile and synthetic files. The manual scenario produced 2,921 RAM samples, but one transient process query returned WinError87; its RAM series is not used as a complete comparative memory result. This does not invalidate the observed UI or persisted-byte checks. Automated release measurements remain separate.

Final checks: 116 frontend unit tests, eight DOM preview fidelity/sanitization cases, workspace DOM clean-flush/delayed-save/recovery-retry cases, strict TypeScript, formatting, lint (existing warnings), canonical Go tests including five new recovery-load tests, offline dependency scan, source-hash verification, and release metadata consistency at 0.14.3. GNU make is unavailable on this Windows host, so its component gates were run directly. Windows and Linux-target production frontend builds passed; Linux retained one ES module. Native Linux runtime behavior and RAM remain unverified, and no macOS claim is made.

Actual cold-start-to-visible time, click-to-visible latency and physical-display FPS are not established by these measurements. The host was not an isolated performance lab; background use and Remote Desktop affect timings. No exact-commit CI run or public/store release was triggered for this local optimization branch.

## Active-use sequences on the final executable

Four complete release trials supplied 3,044 valid full-process samples and 136 confirmed selections: 24 alternating selections with two distinct 100-line Markdown files in each build, then 44 selections with ten files in each build (24 short-note alternations followed by two mixed-file cycles). Baseline ran before candidate for these sequences; this is one sequence per configuration, not a distribution of repeated native clicks.

The driver uses the app's supported file-open CLI, waits for successful helper exit, waits a 500 ms guard, then reads persisted selection once. This avoids the earlier observer-induced Windows atomic-rename interference. It does not poll session files during writes or verify visible-render completion.

| Active-use phase | Resident median before → after | Resident peak before → after | Commit median before → after |
|---|---:|---:|---:|
| Two 100-line notes | 105.4 → 105.5 | 119.7 → 119.0 | 188.3 → 190.1 |
| 100-line notes with ten files open | 108.5 → 110.3 | 124.1 → 126.3 | 192.1 → 196.8 |
| Mixed files, cycle one | 307.3 → 233.3 | 671.2 → 301.1 | 403.5 → 324.3 |
| Mixed files, cycle two | 518.1 → 241.1 | 695.4 → 325.3 | 611.1 → 333.0 |
| Idle after both mixed cycles | 193.8 → 170.4 | 488.2 → 240.1 | 283.1 → 260.2 |

Peak private residency across the mixed cycles fell from 695.4 to 325.3 MiB (about 53%). Two-note switching stayed near 105 MiB. The eight-second final idle phase includes garbage collection/settling; its median and peak describe that window, not a permanent retained-memory floor.

CLI helper-exit observation medians were 205.3 → 203.8 ms for two files and 206.1 → 205.8 ms for ten files. Those nearly identical numbers measure process launch/IPC and observer polling, **not UI switch latency**. Ten-file profile disk size was about 71.8 MiB in both builds after cleanup (75,244,905 → 75,318,368 bytes), including seeded histories, recovery and WebView data. No disk reduction is claimed.

## Paired recheck of the final artifact

After the recovery and standalone-CR guards, the exact delivered executable was rechecked with 12 fresh paired trials and 1,799 complete samples. Artifact, fixture, source and counter audits all passed, with no changed source hashes and no excluded trials in this repeat.

| Workload | Baseline resident range | Final resident range | Commit median before → after | Peak before → after |
|---|---:|---:|---:|---:|
| 100-line rich Markdown | 89.9–92.1 | 91.3–92.5 | 174.6 → 176.6 | 97.1 → 99.6 |
| 14,000-heading Markdown | 626.7–719.0 | 225.5–230.6 | 747.1 → 315.6 | 797.0 → 242.5 |
| 1,106-line highlighted TypeScript | 143.8–238.8 | 104.1–137.1 | 276.4 → 188.5 | 302.6 → 145.0 |

The repeat confirms the direction of the large-document savings, with substantial run-to-run residency variation, especially in the baseline source preview. It does not justify one universal memory percentage or a small-note speed claim. Across both paired matrices and the active-use sequences, 64 valid comparative release trials supplied 12,019 complete samples; the manual native series is excluded from that total.

Final core Go formatting was verified across the 29 files returned by the Makefile's `rg --files -g '*.go'` scope, after normalizing Windows CRLF to Git LF. Only unchanged `main.go` had CRLF; it was preserved. An initial overbroad raw `git ls-files` formatting command also included unrelated tracked port files and failed; those were not edited or counted as this app's formatting scope.

The delivered local copy is `dist/markpad-optimized.exe` with the same `ba848e…` hash and a sibling `.sha256` file. At 18,852,352 bytes it is 16 KiB larger than baseline. Windows main JS is 1,248,265 bytes, its existing deferred diagram bundle is 5,365,297 bytes, and CSS is 152,226 bytes. Linux's combined JS is 6,597,015 bytes. Bun and development tests are not part of the runtime. This build is not installed or published.
