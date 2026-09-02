import tailwind from "bun-plugin-tailwind";

const result = await Bun.build({
  entrypoints: ["../docs/site.css"],
  outdir: "../docs",
  naming: "styles.css",
  minify: true,
  plugins: [tailwind],
});

if (!result.success) {
  throw new AggregateError(result.logs, "Documentation styles build failed");
}
