import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import "./styles.css";

document.body.className =
  "h-screen w-screen overflow-hidden bg-canvas text-ink font-sans text-sm antialiased select-none";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
