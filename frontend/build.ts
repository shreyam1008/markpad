import { readFile, rm, writeFile } from "node:fs/promises";

import tailwind from "bun-plugin-tailwind";

await rm(new URL("./dist", import.meta.url), { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  drop: ["console", "debugger"],
  // Wails serves production assets from an in-memory custom scheme on Linux.
  // WebKitGTK does not reliably execute Bun's split ES-module graph there.
  splitting: false,
  target: "browser",
  plugins: [tailwind],
  // Compile-time React replacement only. Node is not used at runtime.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  throw new AggregateError(result.logs, "Frontend build failed");
}

// These assets never cross an origin: Wails serves them from its in-memory
// `wails://` scheme. Do not ask WebKitGTK to apply browser-network CORS here.
const indexPath = new URL("./dist/index.html", import.meta.url);
const indexHtml = await readFile(indexPath, "utf8");
await writeFile(indexPath, indexHtml.replaceAll(" crossorigin", ""), "utf8");
