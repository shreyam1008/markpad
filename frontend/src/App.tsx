import {
  Bold,
  ChevronDown,
  Clock3,
  Code2,
  Columns2,
  Copy,
  createIcons,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Quote,
  Redo2,
  Save,
  Search,
  SquarePen,
  Star,
  Strikethrough,
  Table2,
  Trash2,
  Undo2,
  X,
} from "lucide";
import { useEffect, useRef, useState } from "react";

import shell from "./legacy-shell.txt";

const interfaceIcons = {
  Bold,
  ChevronDown,
  Clock3,
  Code2,
  Columns2,
  Copy,
  Eye,
  FolderOpen,
  Image: ImageIcon,
  Info,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Quote,
  Redo2,
  Save,
  Search,
  SquarePen,
  Star,
  Strikethrough,
  Table2,
  Trash2,
  Undo2,
  X,
};

function App() {
  const started = useRef(false);
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const host = document.getElementById("legacy-react-host");
    let iconRefreshQueued = false;
    const paintIcons = () => {
      iconRefreshQueued = false;
      iconObserver.disconnect();
      createIcons({
        attrs: { "aria-hidden": "true", "stroke-width": 1.75 },
        icons: interfaceIcons,
      });
      if (host) iconObserver.observe(host, { childList: true, subtree: true });
    };
    const queueIconRefresh = () => {
      if (iconRefreshQueued) return;
      iconRefreshQueued = true;
      queueMicrotask(paintIcons);
    };
    const iconObserver = new MutationObserver((records) => {
      const hasUnpaintedIcon = records.some((record) =>
        [...record.addedNodes].some(
          (node) =>
            node instanceof Element &&
            (node.matches("i[data-lucide]") || node.querySelector("i[data-lucide]")),
        ),
      );
      if (hasUnpaintedIcon) queueIconRefresh();
    });
    if (host) iconObserver.observe(host, { childList: true, subtree: true });
    queueIconRefresh();

    void import("./legacy-controller").catch((error: unknown) => {
      setStartupError(error instanceof Error ? error.message : String(error));
    });

    return () => iconObserver.disconnect();
  }, []);

  if (startupError) {
    return (
      <main className="flex h-full items-center justify-center bg-[#f4f2ed] p-8 text-[#1a1c1b]">
        <section className="max-w-xl rounded-2xl border border-[#d8d6ce] bg-[#fafaf7] p-6 shadow-xl">
          <h1 className="text-base font-bold">Markpad could not finish starting</h1>
          <p className="mt-3 text-sm leading-6 text-[#6b6e68]">{startupError}</p>
        </section>
      </main>
    );
  }

  return <div id="legacy-react-host" dangerouslySetInnerHTML={{ __html: shell }} />;
}

export default App;
