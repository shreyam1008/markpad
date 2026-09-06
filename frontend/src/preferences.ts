export type ThemeMode = "system" | "light" | "dark";
export type ThemePalette = "markpad" | "graphite" | "nord" | "solarized" | "rose" | "contrast";
export type LineSpacing = "compact" | "comfortable" | "relaxed";
export type ReadingWidth = "focused" | "balanced" | "full";

export interface Preferences {
  version: 1;
  themeMode: ThemeMode;
  palette: ThemePalette;
  uiScale: number;
  textSize: number;
  lineSpacing: LineSpacing;
  readingWidth: ReadingWidth;
  reducedMotion: boolean;
}

export const PREFERENCES_KEY = "markpad-preferences-v1";
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.5;
export const TEXT_SIZE_MIN = 10;
export const TEXT_SIZE_MAX = 28;

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  themeMode: "system",
  palette: "markpad",
  uiScale: 1,
  textSize: 14,
  lineSpacing: "comfortable",
  readingWidth: "balanced",
  reducedMotion: false,
};

const themeModes = new Set<ThemeMode>(["system", "light", "dark"]);
const palettes = new Set<ThemePalette>([
  "markpad",
  "graphite",
  "nord",
  "solarized",
  "rose",
  "contrast",
]);
const lineSpacings = new Set<LineSpacing>(["compact", "comfortable", "relaxed"]);
const readingWidths = new Set<ReadingWidth>(["focused", "balanced", "full"]);

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function normalizePreferences(value: unknown): Preferences {
  const candidate = value && typeof value === "object" ? (value as Partial<Preferences>) : {};
  return {
    version: 1,
    themeMode: themeModes.has(candidate.themeMode as ThemeMode)
      ? (candidate.themeMode as ThemeMode)
      : DEFAULT_PREFERENCES.themeMode,
    palette: palettes.has(candidate.palette as ThemePalette)
      ? (candidate.palette as ThemePalette)
      : DEFAULT_PREFERENCES.palette,
    uiScale: clamp(candidate.uiScale, UI_SCALE_MIN, UI_SCALE_MAX, DEFAULT_PREFERENCES.uiScale),
    textSize: clamp(candidate.textSize, TEXT_SIZE_MIN, TEXT_SIZE_MAX, DEFAULT_PREFERENCES.textSize),
    lineSpacing: lineSpacings.has(candidate.lineSpacing as LineSpacing)
      ? (candidate.lineSpacing as LineSpacing)
      : DEFAULT_PREFERENCES.lineSpacing,
    readingWidth: readingWidths.has(candidate.readingWidth as ReadingWidth)
      ? (candidate.readingWidth as ReadingWidth)
      : DEFAULT_PREFERENCES.readingWidth,
    reducedMotion:
      typeof candidate.reducedMotion === "boolean"
        ? candidate.reducedMotion
        : DEFAULT_PREFERENCES.reducedMotion,
  };
}

export function loadPreferences(
  storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined"
    ? undefined
    : localStorage,
): Preferences {
  if (!storage) return DEFAULT_PREFERENCES;
  try {
    const saved = storage.getItem(PREFERENCES_KEY);
    if (saved) return normalizePreferences(JSON.parse(saved));
  } catch {
    // A damaged setting should never prevent Quillpane from opening.
  }

  return normalizePreferences({
    uiScale: storage.getItem("markpad-ui-zoom") ?? DEFAULT_PREFERENCES.uiScale,
    textSize: storage.getItem("markpad-text-zoom") ?? DEFAULT_PREFERENCES.textSize,
  });
}

export function savePreferences(
  preferences: Preferences,
  storage: Pick<Storage, "setItem"> | undefined = typeof localStorage === "undefined"
    ? undefined
    : localStorage,
) {
  if (!storage) return;
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(normalizePreferences(preferences)));
  } catch {
    // Private storage policies must not make appearance controls unusable in-session.
  }
}

export function systemPrefersDark() {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function subscribeSystemTheme(onChange: () => void) {
  if (typeof matchMedia !== "function") return () => undefined;
  const query = matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function resolveAppearance(mode: ThemeMode, dark = systemPrefersDark()) {
  return mode === "system" ? (dark ? "dark" : "light") : mode;
}

export function applyPreferencesToDocument(
  preferences: Preferences,
  dark = systemPrefersDark(),
  root: HTMLElement = document.documentElement,
) {
  const appearance = resolveAppearance(preferences.themeMode, dark);
  root.dataset.appearance = appearance;
  root.dataset.themeMode = preferences.themeMode;
  root.dataset.palette = preferences.palette;
  root.dataset.lineSpacing = preferences.lineSpacing;
  root.dataset.readingWidth = preferences.readingWidth;
  root.dataset.reducedMotion = String(preferences.reducedMotion);
  root.style.colorScheme = appearance;
}

export const initialPreferences = loadPreferences();
