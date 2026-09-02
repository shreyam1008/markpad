import { rm } from "node:fs/promises";

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
