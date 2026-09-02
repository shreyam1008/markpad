import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const palettes = ["markpad", "graphite", "nord", "solarized", "rose", "contrast"] as const;

function declarations(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing theme selector: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return Object.fromEntries(
    [...css.slice(open + 1, close).matchAll(/(--mp-[\w-]+):\s*(#[\da-f]{3,8})\s*;/gi)].map(
      ([, name, value]) => [name, value],
    ),
  );
}

function luminance(color: string) {
  let hex = color.slice(1);
  if (hex.length === 3) hex = [...hex].map((character) => character + character).join("");
  const [red, green, blue] = [0, 2, 4]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("paired theme contrast", () => {
  test("keeps ordinary text, selection, and primary actions readable in every mode", async () => {
    const css = await readFile(new URL("../src/design/tokens.css", import.meta.url), "utf8");
    const base = declarations(css, ":root");
    const dark = declarations(css, ':root[data-appearance="dark"]');

    const failures: string[] = [];
    for (const palette of palettes) {
      const lightPalette =
        palette === "markpad" ? {} : declarations(css, `:root[data-palette="${palette}"]`);
      const darkPalette =
        palette === "markpad"
          ? {}
          : declarations(css, `:root[data-palette="${palette}"][data-appearance="dark"]`);
      for (const [mode, tokens] of [
        ["light", { ...base, ...lightPalette }],
        ["dark", { ...base, ...dark, ...lightPalette, ...darkPalette }],
      ] as const) {
        const surfacePairs = ["--mp-paper", "--mp-chrome", "--mp-sidebar", "--mp-raised"].flatMap(
          (background) =>
            ["--mp-ink", "--mp-text", "--mp-muted", "--mp-faint"].map(
              (foreground) => [foreground, background] as const,
            ),
        );
        for (const [foreground, background] of [
          ...surfacePairs,
          ["--mp-selected-text", "--mp-selected"] as const,
          ["--mp-on-accent", "--mp-accent"] as const,
        ]) {
          const ratio = contrast(tokens[foreground], tokens[background]);
          if (ratio < 4.5) {
            failures.push(
              `${palette} ${mode}: ${foreground} on ${background} = ${ratio.toFixed(2)}`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
