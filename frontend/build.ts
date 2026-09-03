import { readFile, rm, writeFile } from "node:fs/promises";

import tailwind from "bun-plugin-tailwind";

await rm(new URL("./dist", import.meta.url), { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  drop: ["console", "debugger"],
  splitting: true,
  target: "browser",
  plugins: [tailwind],
  // Compile-time React replacement only. Node is not used at runtime.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  throw new AggregateError(result.logs, "Frontend build failed");
}

// Wails serves bundled assets from its in-memory `wails://` scheme on Linux.
// Bun adds `crossorigin` to module and stylesheet entry tags, which makes
// WebKitGTK reject those custom-scheme requests and leaves the window blank.
// Relative chunk imports remain intact, so lazy-loaded features stay lazy.
const indexPath = new URL("./dist/index.html", import.meta.url);
const indexHtml = await readFile(indexPath, "utf8");
await writeFile(indexPath, indexHtml.replaceAll(" crossorigin", ""), "utf8");
