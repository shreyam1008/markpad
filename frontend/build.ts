import { $ } from "bun";
import tailwind from "bun-plugin-tailwind";

await $`rm -rf ./dist`.quiet();

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  target: "browser",
  plugins: [tailwind],
  // Compile-time React replacement only. Node is not used at runtime.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  throw new AggregateError(result.logs, "Frontend build failed");
}
