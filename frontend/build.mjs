import { $ } from "bun";
import tailwind from "bun-plugin-tailwind";

await $`rm -rf ./dist`.quiet();

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  target: "browser",
  plugins: [tailwind],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}
