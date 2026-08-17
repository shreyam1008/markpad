# Bundle and performance budget

Markpad uses explicit release gates and records measurements without turning estimates into product claims.

## Enforced ceilings

| Artifact | Ceiling | Enforcement |
|---|---:|---|
| Complete raw `frontend/dist` | 512 KiB (524,288 bytes) | `make check-frontend-size` |
| Stripped Linux release binary | 15 MiB (15,728,640 bytes) | `make check-size` and Linux CI |

The 15 MiB value is a hard release ceiling, not a claim that every platform artifact has the same size. Startup time, idle memory, and typing latency are not currently release claims because the project does not yet have a repeatable benchmark harness.

## Frontend measurement

Measured on Linux/amd64 with Bun 1.3.14 on 2026-08-17 after `bun run build`:

| Output | Before stabilization | Current | Change |
|---|---:|---:|---:|
| JavaScript | 1,323,159 bytes | 324,046 bytes | -75.5% |
| CSS | 56,171 bytes | 54,909 bytes | -2.2% |
| Generated HTML | 424 bytes | 424 bytes | 0% |
| **Total raw frontend** | **1,379,754 bytes** | **379,379 bytes** | **-72.5%** |

The reduction comes primarily from removing the redundant React/ReactDOM wrapper and replacing the full highlight.js bundle with core plus the language grammars available for Markpad's supported source types. Marked, DOMPurify, styles, and language grammars remain bundled locally; there is no runtime CDN.

Hashed output filenames may change between builds. Measure the sum of files rather than depending on a particular chunk name:

```sh
make check-frontend-size
```

## Runtime work limits

| Work or data | Limit |
|---|---:|
| Editable local file | 10 MiB |
| Read-only local asset | 50 MiB |
| Draft save debounce | 300 ms |
| Markdown preview debounce | 120 ms |
| Outline/statistics debounce | 180 ms |
| Highlighted code | 2,000 lines and 200,000 characters |
| Browser edit history | 80 states and 1 MiB of stored text |
| Quadratic diff matrix | 2,000,000 cells; larger changes use a linear fallback |
| Saved history | 50 snapshots per document |
| Recent files | 10 entries |

These bounds prevent obvious unbounded growth. They are not substitutes for measurements with realistic documents.

## Binary measurement status

The current Linux binary was not remeasured in this workspace because the GTK/WebKitGTK development packages required for the production link are unavailable. CI installs those packages and rejects a binary above the release ceiling. Record the exact CI artifact size here before making a smaller binary-size claim in public documentation.

## Benchmark backlog

The first repeatable benchmark set should record:

- cold start to interactive and total process-tree PSS on a named OS/webview version;
- typing latency with 100 KiB, 1 MiB, and 10 MiB documents;
- Markdown parse, highlight, sanitize, and DOM update time separately;
- document switching and history restore latency;
- the command, fixture hash, build flags, machine, and date for every result.

Do not reintroduce forced Go garbage collection, `FreeOSMemory`, or JavaScriptCore JIT changes unless this benchmark set demonstrates a net user-visible benefit.

## Change checklist

When frontend code or dependencies change:

1. Build from the committed lockfile.
2. Run `make check` and record the raw output delta.
3. Confirm the asset-policy scan finds no runtime network dependency.
4. Run `make check-size` on a supported Linux build machine or verify the CI result.
5. Explain any material size increase in the change that caused it.
6. Update this file only with reproduced measurements.
