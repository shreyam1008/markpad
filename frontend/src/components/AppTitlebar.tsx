import { useCallback, useEffect, useState } from "react";

import markURL from "../assets/markpad-mark.svg";
import { shortcutLabel } from "../shortcuts";
import {
  Clock3,
  Ellipsis,
  Files,
  Search,
  Settings,
  WindowClose,
  WindowMaximize,
  WindowMinimize,
  WindowRestore,
} from "./icons";

interface Props {
  activeSurface?: "files" | "search" | "history" | "settings" | "more";
  onFiles?(): void;
  onSearch?(): void;
  onHistory?(): void;
  onSettings?(): void;
  onMore?(): void;
}

export function AppTitlebar({
  activeSurface,
  onFiles,
  onSearch,
  onHistory,
  onSettings,
  onMore,
}: Props) {
  const [maximised, setMaximised] = useState(false);

  const syncWindowState = useCallback(async () => {
    try {
      const isMaximised = await window.runtime?.WindowIsMaximised?.();
      if (typeof isMaximised === "boolean") setMaximised(isMaximised);
    } catch {
      // Browser previews and older Wails runtimes do not expose window state.
    }
  }, []);

  useEffect(() => {
    void syncWindowState();
    window.addEventListener("resize", syncWindowState);
    return () => window.removeEventListener("resize", syncWindowState);
  }, [syncWindowState]);

  const toggleMaximise = useCallback(() => {
    window.runtime?.WindowToggleMaximise?.();
    requestAnimationFrame(() => void syncWindowState());
  }, [syncWindowState]);

  return (
    <header
      className="app-titlebar"
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) toggleMaximise();
      }}
    >
      <div className="app-titlebar-brand">
        <img className="app-titlebar-mark" src={markURL} alt="" draggable={false} />
        <span>Markpad</span>
      </div>
      {onFiles || onSearch || onHistory || onSettings || onMore ? (
        <nav className="app-titlebar-actions" aria-label="App navigation">
          {onFiles ? (
            <button
              type="button"
              data-titlebar-interactive
              className={activeSurface === "files" ? "active" : undefined}
              aria-pressed={activeSurface === "files"}
              onClick={onFiles}
              title={`Find files (${shortcutLabel("general.palette")})`}
            >
              <Files />
              <span>Files</span>
            </button>
          ) : null}
          {onSearch ? (
            <button
              type="button"
              data-titlebar-interactive
              className={activeSurface === "search" ? "active" : undefined}
              aria-pressed={activeSurface === "search"}
              onClick={onSearch}
              title={`Search workspace (${shortcutLabel("navigation.workspace-search")})`}
            >
              <Search />
              <span>Search</span>
            </button>
          ) : null}
          {onHistory ? (
            <button
              type="button"
              data-titlebar-interactive
              className={activeSurface === "history" ? "active" : undefined}
              aria-pressed={activeSurface === "history"}
              onClick={onHistory}
              title={`Version history (${shortcutLabel("navigation.history")})`}
            >
              <Clock3 />
              <span>History</span>
            </button>
          ) : null}
          {onSettings ? (
            <button
              type="button"
              data-titlebar-interactive
              className={activeSurface === "settings" ? "active" : undefined}
              aria-pressed={activeSurface === "settings"}
              onClick={onSettings}
              title="Settings"
            >
              <Settings />
              <span>Settings</span>
            </button>
          ) : null}
          {onMore ? (
            <button
              type="button"
              data-titlebar-interactive
              className={activeSurface === "more" ? "active" : undefined}
              aria-pressed={activeSurface === "more"}
              onClick={onMore}
              title="All actions"
            >
              <Ellipsis />
              <span>More</span>
            </button>
          ) : null}
        </nav>
      ) : null}
      <div className="app-titlebar-drag" aria-hidden="true" />
      <div className="app-titlebar-controls" aria-label="Window controls">
        <button
          type="button"
          className="window-control"
          title="Minimize"
          aria-label="Minimize window"
          onClick={() => window.runtime?.WindowMinimise?.()}
        >
          <WindowMinimize />
        </button>
        <button
          type="button"
          className="window-control"
          title={maximised ? "Restore" : "Maximize"}
          aria-label={maximised ? "Restore window" : "Maximize window"}
          onClick={toggleMaximise}
        >
          {maximised ? <WindowRestore /> : <WindowMaximize />}
        </button>
        <button
          type="button"
          className="window-control window-control-close"
          title="Close"
          aria-label="Close window"
          onClick={() => window.runtime?.Quit?.()}
        >
          <WindowClose />
        </button>
      </div>
    </header>
  );
}
