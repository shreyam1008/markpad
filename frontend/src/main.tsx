import { HotkeysProvider } from "@tanstack/react-hotkeys";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { applyPreferencesToDocument, initialPreferences } from "./preferences";

import "./styles.css";

applyPreferencesToDocument(initialPreferences);

void window.runtime
  ?.Environment?.()
  .then(({ platform }) => {
    if (platform) document.documentElement.dataset.platform = platform;
  })
  .catch(() => {
    // Browser previews and older Wails runtimes may not expose platform details.
  });

document.body.className =
  "h-screen w-screen overflow-hidden bg-canvas text-ink font-sans text-sm antialiased select-none";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HotkeysProvider
      defaultOptions={{
        hotkey: {
          preventDefault: true,
          stopPropagation: true,
        },
      }}
    >
      <App />
    </HotkeysProvider>
  </React.StrictMode>,
);
