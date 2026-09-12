import {
  formatForDisplay,
  type RegisterableHotkey,
  type UseHotkeyDefinition,
} from "@tanstack/react-hotkeys";

import { PRODUCT_NAME } from "./brand";

export type ShortcutGroup = "General" | "File" | "Navigation" | "Edit" | "View" | "Appearance";

export type ShortcutAction =
  | "help"
  | "palette"
  | "dismiss"
  | "new"
  | "open"
  | "openfolder"
  | "filedraft"
  | "refreshworkspace"
  | "save"
  | "saveas"
  | "close"
  | "rename"
  | "delete"
  | "find"
  | "searchworkspace"
  | "undo"
  | "redo"
  | "formatbold"
  | "formatitalic"
  | "formatlink"
  | "nextfile"
  | "previousfile"
  | "vieweditor"
  | "viewsplit"
  | "viewpreview"
  | "toggleview"
  | "togglesidebar"
  | "history"
  | "zoomin"
  | "zoomout"
  | "zoomreset"
  | "textzoomin"
  | "textzoomout"
  | "textzoomreset"
  | "preferences";

export interface ShortcutDefinition {
  id: string;
  commandId: string;
  action: ShortcutAction;
  hotkey: RegisterableHotkey;
  name: string;
  description: string;
  group: ShortcutGroup;
  displayKey?: string;
  showInSettings?: boolean;
}

declare module "@tanstack/hotkeys" {
  interface HotkeyMeta {
    commandId?: string;
    group?: ShortcutGroup;
    displayKey?: string;
    showInSettings?: boolean;
  }
}

const shortcut = (
  id: string,
  hotkey: RegisterableHotkey,
  action: ShortcutAction,
  group: ShortcutGroup,
  name: string,
  description: string,
  options: Pick<ShortcutDefinition, "commandId" | "displayKey" | "showInSettings"> = {
    commandId: id,
  },
): ShortcutDefinition => ({
  id,
  commandId: options.commandId,
  hotkey,
  action,
  group,
  name,
  description,
  displayKey: options.displayKey,
  showInSettings: options.showInSettings ?? true,
});

export const SHORTCUTS: ReadonlyArray<ShortcutDefinition> = [
  shortcut(
    "general.help",
    "F1",
    "help",
    "General",
    "Help & updates",
    "Open Help, version details and updates.",
    { commandId: "app.help" },
  ),
  shortcut(
    "general.palette",
    "Mod+P",
    "palette",
    "General",
    "Command palette",
    "Find files and run actions.",
  ),
  shortcut(
    "general.preferences",
    "Mod+,",
    "preferences",
    "General",
    "Settings",
    `Open ${PRODUCT_NAME} settings.`,
  ),
  shortcut(
    "general.dismiss",
    "Escape",
    "dismiss",
    "General",
    "Close current surface",
    "Close the active menu, inspector, or dialog.",
    { commandId: "general.dismiss", showInSettings: false },
  ),

  shortcut("file.new", "Mod+N", "new", "File", "New Markdown file", "Create a new Markdown draft."),
  shortcut(
    "file.open",
    "Mod+O",
    "open",
    "File",
    "Open file",
    "Open a file from the operating system.",
  ),
  shortcut(
    "file.open-folder",
    "Mod+Shift+O",
    "openfolder",
    "File",
    "Open workspace folder",
    "Choose or change the workspace folder.",
  ),
  shortcut(
    "file.file-draft",
    "Mod+Shift+Enter",
    "filedraft",
    "File",
    "File draft in workspace",
    "Save the current draft into the open workspace.",
  ),
  shortcut(
    "file.refresh",
    "F5",
    "refreshworkspace",
    "File",
    "Refresh workspace",
    "Rescan the current workspace folder.",
  ),
  shortcut("file.save", "Mod+S", "save", "File", "Save", "Save the current file."),
  shortcut(
    "file.save-as",
    "Mod+Shift+S",
    "saveas",
    "File",
    "Save as",
    "Save the current file to a new path.",
  ),
  shortcut("file.close", "Mod+W", "close", "File", "Close file", "Close the current file."),
  shortcut("file.rename", "F2", "rename", "File", "Rename file", "Rename the current saved file."),
  shortcut(
    "file.delete",
    "Mod+Delete",
    "delete",
    "File",
    "Delete file",
    "Open the permanent delete confirmation.",
  ),

  shortcut(
    "navigation.next",
    "Mod+Tab",
    "nextfile",
    "Navigation",
    "Next open file",
    "Move to the next open file.",
  ),
  shortcut(
    "navigation.previous",
    "Mod+Shift+Tab",
    "previousfile",
    "Navigation",
    "Previous open file",
    "Move to the previous open file.",
  ),
  shortcut(
    "navigation.find",
    "Mod+F",
    "find",
    "Navigation",
    "Find in file",
    "Search inside the current editable file.",
  ),
  shortcut(
    "navigation.workspace-search",
    "Mod+Shift+F",
    "searchworkspace",
    "Navigation",
    "Find in workspace",
    "Search text across the current workspace.",
  ),
  shortcut(
    "navigation.history",
    "Mod+H",
    "history",
    "Navigation",
    "Version history",
    "Open or close saved-version history.",
  ),

  shortcut("edit.undo", "Mod+Z", "undo", "Edit", "Undo", "Undo the last edit."),
  shortcut("edit.redo", "Mod+Shift+Z", "redo", "Edit", "Redo", "Redo the last undone edit."),
  shortcut(
    "edit.bold",
    "Mod+B",
    "formatbold",
    "Edit",
    "Bold",
    "Toggle bold formatting around the selection.",
  ),
  shortcut(
    "edit.italic",
    "Mod+I",
    "formatitalic",
    "Edit",
    "Italic",
    "Toggle italic formatting around the selection.",
  ),
  shortcut(
    "edit.link",
    "Mod+K",
    "formatlink",
    "Edit",
    "Insert link",
    "Insert Markdown link formatting.",
  ),

  shortcut("view.editor", "Mod+1", "vieweditor", "View", "Editor view", "Show the editor."),
  shortcut(
    "view.split",
    "Mod+2",
    "viewsplit",
    "View",
    "Split view",
    "Show editor and preview together.",
  ),
  shortcut(
    "view.preview",
    "Mod+3",
    "viewpreview",
    "View",
    "Preview view",
    "Show the rendered preview or viewer.",
  ),
  shortcut(
    "view.cycle",
    "Mod+Shift+E",
    "toggleview",
    "View",
    "Cycle view",
    "Move through the available views.",
  ),
  shortcut(
    "view.sidebar",
    "Mod+Shift+B",
    "togglesidebar",
    "View",
    "Toggle sidebar",
    "Show or hide the file sidebar.",
  ),

  shortcut(
    "appearance.interface-in",
    "Mod+=",
    "zoomin",
    "Appearance",
    "Increase interface scale",
    `Make ${PRODUCT_NAME} controls and chrome larger.`,
    { commandId: "appearance.interface-in", displayKey: "+" },
  ),
  shortcut(
    "appearance.interface-in-alias",
    { key: "=", mod: true, shift: true },
    "zoomin",
    "Appearance",
    "Increase interface scale",
    `Make ${PRODUCT_NAME} controls and chrome larger.`,
    { commandId: "appearance.interface-in", showInSettings: false },
  ),
  shortcut(
    "appearance.interface-out",
    "Mod+-",
    "zoomout",
    "Appearance",
    "Decrease interface scale",
    `Make ${PRODUCT_NAME} controls and chrome smaller.`,
  ),
  shortcut(
    "appearance.interface-reset",
    "Mod+0",
    "zoomreset",
    "Appearance",
    "Reset interface scale",
    "Restore interface scale to 100%.",
  ),
  shortcut(
    "appearance.text-in",
    "Mod+Alt+=",
    "textzoomin",
    "Appearance",
    "Increase text size",
    "Make editor and preview text larger.",
    { commandId: "appearance.text-in", displayKey: "+" },
  ),
  shortcut(
    "appearance.text-in-alias",
    { key: "=", mod: true, alt: true, shift: true },
    "textzoomin",
    "Appearance",
    "Increase text size",
    "Make editor and preview text larger.",
    { commandId: "appearance.text-in", showInSettings: false },
  ),
  shortcut(
    "appearance.text-out",
    "Mod+Alt+-",
    "textzoomout",
    "Appearance",
    "Decrease text size",
    "Make editor and preview text smaller.",
  ),
  shortcut(
    "appearance.text-reset",
    "Mod+Alt+0",
    "textzoomreset",
    "Appearance",
    "Reset text size",
    "Restore editor and preview text to 14 px.",
  ),
];

export function shortcutDisplay(hotkey: RegisterableHotkey, displayKey?: string) {
  const formatted = formatForDisplay(hotkey);
  if (!displayKey) return formatted;
  const separator = formatted.includes("+") ? "+" : " ";
  const parts = formatted.split(separator);
  parts[parts.length - 1] = displayKey;
  return parts.join(separator);
}

export function shortcutLabel(commandId: string) {
  const definition = SHORTCUTS.find(
    (candidate) => candidate.commandId === commandId && candidate.showInSettings !== false,
  );
  return definition ? shortcutDisplay(definition.hotkey, definition.displayKey) : undefined;
}

export function createHotkeyDefinitions(
  invoke: (action: ShortcutAction) => void,
): Array<UseHotkeyDefinition> {
  return SHORTCUTS.map((definition) => ({
    hotkey: definition.hotkey,
    callback: () => invoke(definition.action),
    options: {
      ignoreInputs: false,
      stopPropagation: definition.action !== "dismiss",
      meta: {
        name: definition.name,
        description: definition.description,
        commandId: definition.commandId,
        group: definition.group,
        displayKey: definition.displayKey,
        showInSettings: definition.showInSettings,
      },
    },
  }));
}
