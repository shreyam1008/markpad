import { detectPlatform, getHotkeyManager } from "@tanstack/react-hotkeys";
import { useMemo, useState } from "react";

import { PRODUCT_NAME } from "../brand";
import {
  DEFAULT_PREFERENCES,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  type LineSpacing,
  type Preferences,
  type ReadingWidth,
  type ThemeMode,
  type ThemePalette,
} from "../preferences";
import { shortcutDisplay, type ShortcutGroup } from "../shortcuts";
import { HelpContent } from "./HelpContent";
import {
  Check,
  HardDrive,
  Info,
  Keyboard,
  Minus,
  Monitor,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Sun,
  Type,
  X,
} from "./icons";

type SettingsCategory = "appearance" | "writing" | "keyboard" | "files" | "help";

interface Props {
  preferences: Preferences;
  storagePath: string;
  onChange(next: Preferences): void;
  onClose(): void;
  onAbout(): void;
  onChangelog(): void;
  onTour(): void;
}

const categories = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "writing", label: "Writing", icon: Type },
  { id: "keyboard", label: "Keyboard", icon: Keyboard },
  { id: "files", label: "Files", icon: HardDrive },
  { id: "help", label: "Help & updates", icon: Info },
] as const;

const shortcutGroupOrder: ShortcutGroup[] = [
  "General",
  "File",
  "Navigation",
  "Edit",
  "View",
  "Appearance",
];

const modes: Array<{ id: ThemeMode; label: string; icon: typeof Monitor }> = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

const palettes: Array<{ id: ThemePalette; label: string; description: string }> = [
  { id: "markpad", label: PRODUCT_NAME, description: "Calm jade" },
  { id: "graphite", label: "Graphite", description: "Neutral blue" },
  { id: "nord", label: "Nord", description: "Cool arctic" },
  { id: "solarized", label: "Solarized", description: "Warm contrast" },
  { id: "rose", label: "Rose Pine", description: "Soft mauve" },
  { id: "contrast", label: "High Contrast", description: "Maximum clarity" },
];

const lineSpacingOptions: Array<{ id: LineSpacing; label: string; description: string }> = [
  { id: "compact", label: "Compact", description: "More text on screen" },
  { id: "comfortable", label: "Comfortable", description: "Balanced for daily writing" },
  { id: "relaxed", label: "Relaxed", description: "Airy long-form reading" },
];

const readingWidthOptions: Array<{ id: ReadingWidth; label: string; description: string }> = [
  { id: "focused", label: "Focused", description: "Narrow reading column" },
  { id: "balanced", label: "Balanced", description: "Default document width" },
  { id: "full", label: "Full", description: "Use the available pane" },
];

export function SettingsPanel({
  preferences,
  storagePath,
  onChange,
  onClose,
  onAbout,
  onChangelog,
  onTour,
}: Props) {
  const [category, setCategory] = useState<SettingsCategory>("appearance");
  const hotkeys = useMemo(() => Array.from(getHotkeyManager().registrations.state.values()), []);
  const shortcutGroups = useMemo(
    () =>
      shortcutGroupOrder
        .map((group) => ({
          group,
          shortcuts: hotkeys.filter(
            (registration) =>
              registration.options.meta?.group === group &&
              registration.options.meta.showInSettings !== false,
          ),
        }))
        .filter(({ shortcuts }) => shortcuts.length > 0),
    [hotkeys],
  );
  const shortcutCount = shortcutGroups.reduce((total, group) => total + group.shortcuts.length, 0);

  const update = <Key extends keyof Preferences>(key: Key, value: Preferences[Key]) =>
    onChange({ ...preferences, [key]: value });

  return (
    <aside id="settings-panel" className="settings-panel" aria-label="Settings">
      <header className="settings-header">
        <div>
          <strong>Settings</strong>
          <span>Personalize {PRODUCT_NAME}</span>
        </div>
        <button
          type="button"
          className="settings-close"
          aria-label="Close settings"
          onClick={onClose}
        >
          <X />
        </button>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings categories">
          {categories.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={category === id ? "active" : undefined}
              aria-current={category === id ? "page" : undefined}
              onClick={() => setCategory(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {category === "help" ? (
            <section className="settings-category" aria-label="Help and updates">
              <div className="settings-section-heading">
                <h2>Help & updates</h2>
                <p>About the app, installed version, and updates.</p>
              </div>
              <HelpContent onAbout={onAbout} onChangelog={onChangelog} onTour={onTour} />
            </section>
          ) : null}
          {category === "appearance" ? (
            <section aria-labelledby="settings-appearance-title">
              <div className="settings-section-heading">
                <h2 id="settings-appearance-title">Appearance</h2>
                <p>Every surface changes together—chrome, editor, preview, syntax, and diagrams.</p>
              </div>

              <div className="settings-group">
                <span className="settings-label">Mode</span>
                <fieldset className="theme-mode-grid" aria-label="Color mode">
                  {modes.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={preferences.themeMode === id ? "active" : undefined}
                      aria-pressed={preferences.themeMode === id}
                      onClick={() => update("themeMode", id)}
                    >
                      <Icon />
                      <span>{label}</span>
                      {preferences.themeMode === id ? (
                        <Check className="theme-choice-check" />
                      ) : null}
                    </button>
                  ))}
                </fieldset>
              </div>

              <div className="settings-group">
                <span className="settings-label">Color theme</span>
                <div className="theme-palette-grid">
                  {palettes.map((palette) => (
                    <button
                      key={palette.id}
                      type="button"
                      className={`theme-palette-option${preferences.palette === palette.id ? " active" : ""}`}
                      data-palette-preview={palette.id}
                      aria-pressed={preferences.palette === palette.id}
                      onClick={() => update("palette", palette.id)}
                    >
                      <span className="theme-swatch" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="theme-palette-copy">
                        <strong>{palette.label}</strong>
                        <small>{palette.description}</small>
                      </span>
                      {preferences.palette === palette.id ? <Check /> : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <strong>Interface scale</strong>
                  <span>Resize {PRODUCT_NAME}’s controls and chrome.</span>
                  <span className="settings-shortcut-hint">
                    <kbd>{shortcutDisplay("Mod+=", "+")}</kbd>
                    <kbd>{shortcutDisplay("Mod+-")}</kbd>
                    <kbd>{shortcutDisplay("Mod+0")}</kbd>
                  </span>
                </div>
                <select
                  aria-label="Interface scale"
                  value={preferences.uiScale}
                  onChange={(event) => update("uiScale", Number(event.target.value))}
                >
                  {[0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5].map((scale) => (
                    <option key={scale} value={scale}>
                      {Math.round(scale * 100)}%
                    </option>
                  ))}
                </select>
              </div>

              <div className="settings-row">
                <div id="reduced-motion-label">
                  <strong>Reduce motion</strong>
                  <span>Keep state changes immediate and quiet.</span>
                </div>
                <input
                  id="reduced-motion"
                  className="settings-switch"
                  type="checkbox"
                  role="switch"
                  aria-labelledby="reduced-motion-label"
                  aria-checked={preferences.reducedMotion}
                  checked={preferences.reducedMotion}
                  onChange={(event) => update("reducedMotion", event.target.checked)}
                />
              </div>
            </section>
          ) : null}

          {category === "writing" ? (
            <section aria-labelledby="settings-writing-title">
              <div className="settings-section-heading">
                <h2 id="settings-writing-title">Writing</h2>
                <p>Tune the editor and preview without changing the file.</p>
              </div>

              <div className="settings-group">
                <div className="settings-label-row">
                  <span className="settings-label">Text size</span>
                  <output>{preferences.textSize}px</output>
                </div>
                <div className="settings-range-control">
                  <button
                    type="button"
                    aria-label="Decrease text size"
                    disabled={preferences.textSize <= TEXT_SIZE_MIN}
                    onClick={() => update("textSize", preferences.textSize - 1)}
                  >
                    <Minus />
                  </button>
                  <input
                    className="settings-range"
                    type="range"
                    aria-label="Editor and preview text size"
                    min={TEXT_SIZE_MIN}
                    max={TEXT_SIZE_MAX}
                    step={1}
                    value={preferences.textSize}
                    onChange={(event) => update("textSize", Number(event.target.value))}
                  />
                  <button
                    type="button"
                    aria-label="Increase text size"
                    disabled={preferences.textSize >= TEXT_SIZE_MAX}
                    onClick={() => update("textSize", preferences.textSize + 1)}
                  >
                    <Plus />
                  </button>
                </div>
                <div className="settings-range-scale" aria-hidden="true">
                  <span>Smaller</span>
                  <span>Larger</span>
                </div>
                <div className="settings-shortcut-hint">
                  <kbd>{shortcutDisplay("Mod+Alt+=", "+")}</kbd>
                  <kbd>{shortcutDisplay("Mod+Alt+-")}</kbd>
                  <kbd>{shortcutDisplay("Mod+Alt+0")}</kbd>
                  <span>or {shortcutDisplay("Mod+=", "wheel")} over the editor</span>
                </div>
              </div>

              <div className="settings-group">
                <span className="settings-label">Line spacing</span>
                <div className="settings-choice-list">
                  {lineSpacingOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={preferences.lineSpacing === option.id ? "active" : undefined}
                      aria-pressed={preferences.lineSpacing === option.id}
                      onClick={() => update("lineSpacing", option.id)}
                    >
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                      {preferences.lineSpacing === option.id ? <Check /> : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-group">
                <span className="settings-label">Reading width</span>
                <div className="settings-choice-list">
                  {readingWidthOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={preferences.readingWidth === option.id ? "active" : undefined}
                      aria-pressed={preferences.readingWidth === option.id}
                      onClick={() => update("readingWidth", option.id)}
                    >
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                      {preferences.readingWidth === option.id ? <Check /> : null}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {category === "keyboard" ? (
            <section aria-labelledby="settings-keyboard-title">
              <div className="settings-section-heading">
                <h2 id="settings-keyboard-title">Keyboard</h2>
                <p>
                  These are the live TanStack registrations used by {PRODUCT_NAME}, its menus, and
                  the command palette.
                </p>
              </div>
              <div className="settings-info-card shortcut-summary">
                <Keyboard />
                <div>
                  <strong>{shortcutCount} active shortcuts</strong>
                  <span>
                    {detectPlatform() === "mac"
                      ? "Command is shown for Mod on macOS."
                      : "Ctrl is shown for Mod on Windows and Linux."}
                  </span>
                </div>
              </div>
              <div className="shortcut-groups">
                {shortcutGroups.map(({ group, shortcuts }) => (
                  <fieldset key={group} className="shortcut-group">
                    <legend>{group}</legend>
                    <div className="shortcut-list">
                      {shortcuts.map((registration) => (
                        <div className="shortcut-row" key={registration.id}>
                          <span>
                            <strong>{registration.options.meta?.name}</strong>
                            <small>{registration.options.meta?.description}</small>
                          </span>
                          <kbd>
                            {shortcutDisplay(
                              registration.hotkey,
                              registration.options.meta?.displayKey,
                            )}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <p className="settings-footnote">
                Text size also responds to {shortcutDisplay("Mod+=", "mouse wheel")} while the
                pointer is over the editor or preview.
              </p>
            </section>
          ) : null}

          {category === "files" ? (
            <section aria-labelledby="settings-files-title">
              <div className="settings-section-heading">
                <h2 id="settings-files-title">Files</h2>
                <p>{PRODUCT_NAME} stays local and lets the operating system own your files.</p>
              </div>
              <div className="settings-info-card">
                <HardDrive />
                <div>
                  <strong>Local storage</strong>
                  <span>{storagePath}</span>
                </div>
              </div>
              <div className="settings-info-card">
                <Type />
                <div>
                  <strong>File handling</strong>
                  <span>
                    Markdown opens in Editor, Split, or Preview. Text and code open in Editor or
                    Viewer. Binary documents use the system viewer.
                  </span>
                </div>
              </div>
              <p className="settings-footnote">
                No cloud, account, telemetry, or runtime network dependency.
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <footer className="settings-footer">
        <button type="button" onClick={() => onChange(DEFAULT_PREFERENCES)}>
          <RotateCcw />
          Restore defaults
        </button>
        <span>Saved automatically</span>
      </footer>
    </aside>
  );
}
