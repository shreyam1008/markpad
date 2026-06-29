# Phase 1 Evidence

Captured on Linux/X11, kernel `6.17.0-35-generic`, Intel i9-9900, 32 GB RAM.

## Build Artifacts

| Artifact | Size |
| --- | ---: |
| Wails executable `dist/shreyamnotes` | 23,752,328 bytes |
| Wails embedded web bundle | 13,745,402 bytes |
| legacy desktop runtime executable `dist/linux-unpacked/ZenNotes` | 206,339,288 bytes |
| legacy desktop runtime installed directory `dist/linux-unpacked` | 574,211,415 bytes |

## Runtime Samples

Corrected Linux desktop benchmark, suite `perf2-20260628T064951Z`, 10 runs, 10
seconds of memory sampling after readiness. The collector sums PSS/RSS/USS for
the launched process tree and matching process group/session so WebKitGTK helper
processes and legacy desktop runtime helper processes are both included.

| App | Readiness Marker | OK/Total | Startup Median/P95 | Process Count | PSS Max Median/P95 | USS Max Median/P95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ShreyamNotes Wails | `ShreyamNotes DOM probe` | 10/10 | 809/886 ms | 3/3 | 172.5/220.0 MiB | 124.1/169.8 MiB |
| ZenNotes legacy desktop runtime | `[zen:perf] main.window.ready-to-show` | 10/10 | 1009/1043 ms | 6/6 | 351.2/352.9 MiB | 237.1/238.9 MiB |

Notes:

- Wails median PSS is 50.9% lower than packaged legacy desktop runtime under the same harness.
- Wails median startup is 19.8% faster than packaged legacy desktop runtime under the same harness.
- legacy desktop runtime was launched with `--no-sandbox` because the local `chrome-sandbox` helper is not root-owned/mode `4755`.

## Big Vault Simulation

Synthetic vault: `/tmp/shreyamnotes-5000-vault`, 5,000 markdown notes spread
across 50 folders with tags, wikilinks, fenced code blocks, and 715 task lines.

Wails suite `bigvault-20260628T065431Z`, 3 runs, 8 seconds of memory sampling
after readiness:

| App | Scenario | OK/Total | Startup Median/P95 | Process Count | PSS Max Median/P95 | USS Max Median/P95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ShreyamNotes Wails | `big_vault_5000` | 3/3 | 782/789 ms | 3/3 | 194.6/196.2 MiB | 148.2/149.8 MiB |

Headless browser validation against the Go server on the same 5,000-note vault:

- screenshot: `.playwright-cli/page-2026-06-28T06-56-24-821Z.png`
- visible evidence: sidebar `Inbox 5000`, recent notes, and task list
- console health: `Errors: 0, Warnings: 0`

## Visual Evidence

Headless Playwright against the same React app and Go router captured:

- onboarding screen
- post-skip home/sidebar workspace
- console health: `Errors: 0, Warnings: 0`

Desktop OS screenshot capture was unavailable because `scrot`, `gnome-screenshot`, ImageMagick `import`, `grim`, `spectacle`, and `maim` were not installed. The Wails binary itself did boot and emitted:

```text
ShreyamNotes DOM probe {"title":"ZenNotes","rootFound":true,"rootChildren":1,"rootRect":{"width":1280,"height":794},"bodyTextLength":367,"href":"wails://wails/"}
```
