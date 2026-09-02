import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { normalizeRegisterableHotkey, validateHotkey } from "@tanstack/react-hotkeys";

import { SHORTCUTS, shortcutLabel } from "../src/shortcuts";

describe("unified shortcuts", () => {
  test("keeps every TanStack registration valid and uniquely identified", () => {
    expect(new Set(SHORTCUTS.map(({ id }) => id)).size).toBe(SHORTCUTS.length);
    for (const definition of SHORTCUTS) {
      const normalized = normalizeRegisterableHotkey(definition.hotkey);
      expect(validateHotkey(normalized).valid, `${definition.id}: ${normalized}`).toBe(true);
    }
  });

  test("formats platform-aware labels from the same registry", () => {
    expect(shortcutLabel("file.save")).toMatch(/(?:Ctrl|⌘).*S/);
    expect(shortcutLabel("appearance.interface-in")).toEndWith("+");
    expect(shortcutLabel("appearance.text-in")).toContain("Alt");
  });

  test("routes native menu accelerators through the same React actions", async () => {
    const [main, app] = await Promise.all([
      readFile(new URL("../../main.go", import.meta.url), "utf8"),
      readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    ]);
    const nativeActions = [...main.matchAll(/EventsEmit\(app\.ctx, "menu:([^"]+)"\)/g)].map(
      ([, action]) => action,
    );
    for (const action of nativeActions) {
      expect(app).toMatch(new RegExp(`\\n\\s+${action}(?::|,)`));
      expect(app).toContain(`"${action}"`);
    }
    expect(app).toContain("createHotkeyDefinitions");
    expect(app).not.toMatch(/shortcut:\s*"Ctrl/i);
  });
});
