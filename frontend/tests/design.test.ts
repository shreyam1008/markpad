import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("design contract", () => {
  test("defines the permanent semantic and geometry roles", async () => {
    const tokens = await source("../src/design/tokens.css");
    for (const token of [
      "--mp-canvas",
      "--mp-chrome",
      "--mp-sidebar",
      "--mp-paper",
      "--mp-editor",
      "--mp-ink",
      "--mp-muted",
      "--mp-selected",
      "--mp-selected-border",
      "--mp-focus",
      "--mp-titlebar-height",
      "--mp-document-rail-height",
      "--mp-format-rail-height",
      "--mp-status-height",
      "--mp-sidebar-width",
      "--mp-history-width",
      "--mp-command-width",
      "--mp-syntax-keyword",
      "--mp-syntax-string",
      "--mp-font-body",
      "--mp-overlay",
      "--mp-shadow-dialog",
      "--mp-danger-soft",
    ]) {
      expect(tokens).toContain(`${token}:`);
    }
  });

  test("keeps the active workbench free of layout-wide transitions and local hex colors", async () => {
    const styles = await source("../src/styles.css");
    const workbench = styles.slice(styles.indexOf("/* Markpad Workbench"));
    expect(styles).not.toMatch(/transition\s*:\s*all\b/i);
    expect(workbench).not.toMatch(/#[\da-f]{3,8}\b/i);
  });

  test("keeps window chrome fixed, accessible, and correctly draggable", async () => {
    const [styles, titlebar] = await Promise.all([
      source("../src/styles.css"),
      source("../src/components/AppTitlebar.tsx"),
    ]);
    expect(styles).toContain("--wails-draggable: drag");
    expect(styles).toContain("--wails-draggable: no-drag");
    expect(styles).toContain("height: var(--mp-titlebar-height)");
    expect(titlebar).toContain('aria-label="Minimize window"');
    expect(titlebar).toContain('aria-label="Close window"');
    expect(titlebar).toContain("WindowToggleMaximise");
    expect(titlebar).toContain('aria-label="App navigation"');
    for (const surface of ["Files", "Search", "History", "Settings", "More"]) {
      expect(titlebar).toContain(`<span>${surface}</span>`);
    }
    expect(titlebar).not.toContain("onOpenFolder");
    expect(titlebar).not.toContain("onNew");
  });

  test("makes transient navigation dismissible and selection unambiguous", async () => {
    const [styles, sidebar, palette] = await Promise.all([
      source("../src/styles.css"),
      source("../src/components/Sidebar.tsx"),
      source("../src/components/CommandPalette.tsx"),
    ]);
    const workbench = styles.slice(styles.indexOf("/* Markpad Workbench"));
    expect(sidebar).toContain('window.addEventListener("pointerdown", closeOutside, true)');
    expect(sidebar).toContain('window.addEventListener("keydown", closeOnEscape, true)');
    expect(palette).toContain('role="listbox"');
    expect(palette).toContain('role="option"');
    expect(palette).toContain("aria-selected");
    expect(workbench).toContain(".command-item:hover:not(.active)");
    expect(workbench).toContain("grid-template-rows: 48px minmax(0, 1fr) 34px");
  });

  test("centers dialogs and keeps pointer menus inside the viewport", async () => {
    const [styles, app, floating] = await Promise.all([
      source("../src/styles.css"),
      source("../src/App.tsx"),
      source("../src/ui/floating.ts"),
    ]);
    const workbench = styles.slice(styles.indexOf("/* Markpad Workbench"));
    expect(workbench).toContain("place-items: center");
    expect(workbench).toContain("position: relative");
    expect(workbench).toContain("max-height: calc(100dvh - 16px)");
    expect(app).toContain("useLayoutEffect");
    expect(app).toContain("clampFloatingPosition");
    expect(app).toContain('visibility: contextMenu.placed ? "visible" : "hidden"');
    expect(floating).toContain("DEFAULT_VIEWPORT_GUTTER = 8");
  });

  test("opens history without shifting the document and guards async snapshots", async () => {
    const [styles, history] = await Promise.all([
      source("../src/styles.css"),
      source("../src/components/HistoryPanel.tsx"),
    ]);
    const workbench = styles.slice(styles.indexOf("/* Markpad Workbench"));
    expect(workbench).toContain(".history-panel {");
    expect(workbench).toContain("position: absolute");
    expect(history).toContain("request.current === currentRequest");
    expect(history).toContain("Loading history…");
    expect(history).toContain("snapshotTime(entry.timestamp)");
  });

  test("owns syntax styling instead of importing a stock theme", async () => {
    const [styles, renderer] = await Promise.all([
      source("../src/styles.css"),
      source("../src/preview/render.ts"),
    ]);
    expect(renderer).not.toContain("highlight.js/styles/");
    expect(renderer).toContain('from "highlight.js/lib/core"');
    expect(renderer).not.toContain('from "highlight.js";');
    expect(renderer).toContain("hljs.registerLanguage");
    expect(styles).toContain(".hljs-keyword");
    expect(styles).toContain("var(--mp-syntax-keyword)");
    expect(renderer).toContain("200_000");
    expect(renderer).toContain("2_000");
  });

  test("keeps derived document props stable and diagrams off the startup path", async () => {
    const [app, workspace, mermaid] = await Promise.all([
      source("../src/App.tsx"),
      source("../src/components/DocumentWorkspace.tsx"),
      source("../src/preview/mermaid.ts"),
    ]);
    expect(app).toContain("const activeDocument = useMemo(");
    expect(app).toContain("note={activeDocument}");
    expect(workspace).toContain('import("../preview/mermaid")');
    expect(workspace).toContain('node.getAttribute("aria-busy") !== "true"');
    expect(mermaid).toContain('await import("mermaid")');
    expect(mermaid).toContain('securityLevel: "strict"');
  });

  test("keeps confirmation dialogs spacious, separated, and accessible", async () => {
    const [styles, app, dialog, quitDialog] = await Promise.all([
      source("../src/styles.css"),
      source("../src/App.tsx"),
      source("../src/components/CloseDialog.tsx"),
      source("../src/components/QuitDialog.tsx"),
    ]);
    const workbench = styles.slice(styles.indexOf("/* Markpad Workbench"));
    expect(workbench).toContain(".close-dialog {");
    expect(workbench).toContain("width: min(400px, 100%)");
    expect(workbench).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(workbench).toContain("gap: var(--mp-space-4)");
    expect(dialog).toContain('role="alertdialog"');
    expect(dialog).toContain('aria-describedby="close-dialog-description"');
    expect(dialog).toContain("requestAnimationFrame");
    expect(workbench).toContain(".quit-actions {");
    expect(workbench).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(quitDialog).toContain('role="alertdialog"');
    expect(quitDialog).toContain('event.key === "Escape"');
    expect(quitDialog).toContain("requestAnimationFrame");
    expect(quitDialog).toContain("<AlertTriangle />");
    expect(dialog).toContain("<Save />");
    expect(app).toContain('runtime.EventsOn("app:quit-requested"');
    expect(app).toContain("showQuitDialog(count)");
    expect(app).toContain("client.quitWithoutSaving()");
  });
});
