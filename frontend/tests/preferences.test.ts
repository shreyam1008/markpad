import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  applyPreferencesToDocument,
  loadPreferences,
  normalizePreferences,
  resolveAppearance,
  savePreferences,
} from "../src/preferences";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    values,
  };
}

describe("preferences", () => {
  test("normalizes damaged and out-of-range settings", () => {
    expect(
      normalizePreferences({
        themeMode: "neon",
        palette: "unknown",
        uiScale: 9,
        textSize: -3,
        lineSpacing: "huge",
        readingWidth: "tiny",
        reducedMotion: "yes",
      }),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      uiScale: 1.5,
      textSize: 10,
    });
  });

  test("migrates the legacy zoom keys once", () => {
    const oldStorage = storage({ "markpad-ui-zoom": "1.2", "markpad-text-zoom": "18" });
    expect(loadPreferences(oldStorage)).toMatchObject({ uiScale: 1.2, textSize: 18 });
  });

  test("saves and reloads all appearance and writing choices", () => {
    const target = storage();
    const preferences = normalizePreferences({
      themeMode: "dark",
      palette: "nord",
      uiScale: 1.1,
      textSize: 17,
      lineSpacing: "relaxed",
      readingWidth: "focused",
      reducedMotion: true,
    });
    savePreferences(preferences, target);
    expect(target.values.has(PREFERENCES_KEY)).toBe(true);
    expect(loadPreferences(target)).toEqual(preferences);
  });

  test("resolves System mode and applies stable root attributes", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");

    const root = { dataset: {}, style: {} } as unknown as HTMLElement;
    applyPreferencesToDocument(
      normalizePreferences({
        themeMode: "system",
        palette: "rose",
        lineSpacing: "compact",
        readingWidth: "full",
        reducedMotion: true,
      }),
      true,
      root,
    );
    expect(root.dataset).toEqual({
      appearance: "dark",
      themeMode: "system",
      palette: "rose",
      lineSpacing: "compact",
      readingWidth: "full",
      reducedMotion: "true",
    });
    expect(root.style.colorScheme).toBe("dark");
  });
});
