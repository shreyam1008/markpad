// Run from the repository: bun .github/scripts/benchmark-content-search.ts
// For V8: bun build .github/scripts/benchmark-content-search.ts --target=node
//   --outfile=temp/benchmark-content-search.mjs; node temp/benchmark-content-search.mjs
// Optional: SEARCH_BENCH_RG points to rg; set it to "none" to omit the CLI comparison.
import { spawnSync } from "node:child_process";
import { cpus, release } from "node:os";

import { searchNoteContent, searchOpenNotes } from "../../frontend/src/workspace/content-search";

const WARMUPS = 5;
const sentence =
  "# Planning notes\nAn ordinary paragraph about release ownership and practical next steps.\n";

function buffers(count: number, size: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    title: `Note ${index}`,
    content:
      sentence.repeat(Math.ceil(size / sentence.length)).slice(0, size) + "\nrare-milestone\n",
  }));
}

interface Measurement {
  name: string;
  medianMs: number;
  p95Ms: number;
  samples: number;
}

const normal = buffers(20, 32_768);
const large = buffers(8, 2_000_000);
const results: Measurement[] = [];

async function measure(name: string, run: () => unknown | Promise<unknown>, samples = 30) {
  for (let index = 0; index < WARMUPS; index++) await run();
  const times: number[] = [];
  for (let index = 0; index < samples; index++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  times.sort((left, right) => left - right);
  results.push({
    name,
    medianMs: Number(times[Math.floor(samples / 2)].toFixed(2)),
    p95Ms: Number(times[Math.ceil(samples * 0.95) - 1].toFixed(2)),
    samples,
  });
}

await measure("20 x 32KiB / sparse exact", () => searchOpenNotes(normal, "rare-milestone"));
await measure("20 x 32KiB / missing exact", () => searchOpenNotes(normal, "nonexistent"));
await measure("20 x 32KiB / common exact capped", () => searchOpenNotes(normal, "ordinary"));
await measure("20 x 32KiB / one typo", () => searchOpenNotes(normal, "owenrship", { fuzzy: true }));
await measure("20 x 32KiB / fuzzy no match", () =>
  searchOpenNotes(normal, "nonexistent", { fuzzy: true }),
);
await measure("8 x 2MB / missing exact", () => searchOpenNotes(large, "nonexistent"), 10);
await measure(
  "8 x 2MB / fuzzy no match",
  () => searchOpenNotes(large, "nonexistent", { fuzzy: true }),
  10,
);
await measure("2MB / pure sync exact", () => searchNoteContent(large[0].content, "rare-milestone"));
await measure("20 x 32KiB / lower+indexOf (offsets only, no snippets)", () => {
  for (const { content } of normal) content.toLowerCase().indexOf("rare-milestone");
});

const rg = process.env.SEARCH_BENCH_RG || "rg";
const probe =
  rg === "none" ? undefined : spawnSync(rg, ["--version"], { encoding: "utf8", windowsHide: true });
const cli: { available: boolean; version?: string; skipped?: string; comparison: string } = {
  available: probe?.status === 0,
  comparison:
    "Same ASCII live-buffer contents combined on stdin. rg includes process startup, UTF-8 encoding, stdout decoding and JSON parsing; no note IDs, UTF-16 conversion or snippets. This does not measure Linux or claim a universal fastest engine.",
};
if (cli.available) {
  cli.version = probe!.stdout.split(/\r?\n/)[0];
  const joined = normal.map(({ content }) => content).join("\n");
  await measure("rg -F -i --json STDIN (complete process cost)", () => {
    const child = spawnSync(rg, ["--no-config", "-F", "-i", "--json", "rare-milestone", "-"], {
      input: joined,
      encoding: "utf8",
      windowsHide: true,
    });
    if (child.status !== 0) throw new Error(child.error?.message || child.stderr);
    for (const line of child.stdout.trim().split("\n")) JSON.parse(line);
  });
} else {
  cli.skipped =
    rg === "none"
      ? "Disabled with SEARCH_BENCH_RG=none"
      : probe?.error?.message || probe?.stderr || "rg is unavailable";
}

const controller = new AbortController();
const start = performance.now();
const pending = searchOpenNotes(large, "nonexistent", { fuzzy: true, signal: controller.signal });
let abortAt = 0;
setTimeout(() => {
  abortAt = performance.now() - start;
  controller.abort();
}, 0);
const cancelled = await pending;

console.log(
  JSON.stringify(
    {
      timestampUTC: new Date().toISOString(),
      runtime: process.versions.bun
        ? `Bun ${process.versions.bun} / JavaScriptCore`
        : `${process.version} / V8 ${process.versions.v8}`,
      platform: process.platform,
      osRelease: release(),
      architecture: process.arch,
      cpu: cpus()[0]?.model,
      fixture: {
        synthetic: true,
        normalNotes: normal.length,
        normalCharacters: normal.reduce((sum, note) => sum + note.content.length, 0),
        largeNotes: large.length,
        largeCharacters: large.reduce((sum, note) => sum + note.content.length, 0),
        warmups: WARMUPS,
        noteBody: sentence,
        limitations:
          "Warm deterministic ASCII data in a CLI runtime, excludes native bridge reads, DOM layout, debounce and cold startup. Run the native WebView2 smoke benchmark for that runtime; large fuzzy scans cooperate with event-loop cancellation.",
      },
      results,
      cli,
      cancellation: {
        cancelled: cancelled.cancelled,
        abortAtMs: Number(abortAt.toFixed(2)),
        settledAtMs: Number((performance.now() - start).toFixed(2)),
      },
    },
    null,
    2,
  ),
);
