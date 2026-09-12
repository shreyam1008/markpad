import { driver, type DriveStep } from "driver.js";

import "driver.js/dist/driver.css";
import { useEffect, useRef } from "react";

const steps: DriveStep[] = [
  {
    popover: {
      title: "Welcome to Quillpane",
      description:
        "A guided look at your notepad. This tour only highlights controls: it will not edit, save, or close your files. Use Next and Back, or Escape to leave.",
    },
  },
  {
    element: ".sidebar-command-rail",
    popover: {
      title: "Create or open a file",
      description:
        "New starts a Markdown draft. Its arrow offers other file types. Open file brings up your system file picker; Ctrl+O (Command+O on macOS) works too.",
    },
  },
  {
    element: ".sidebar-scroll",
    popover: {
      title: "Your files",
      description:
        "Open files, favorites, outline headings, and recent files live here. Symbols, extension labels, and colors distinguish document types. Drag open files to reorder them; right-click for file actions.",
    },
  },
  {
    element: '[data-tour="files"]',
    popover: {
      title: "Find an open file",
      description:
        "Files opens a searchable list. Ctrl+P (Command+P on macOS) also finds files and commands. Use the arrow keys and Enter to choose.",
    },
  },
  {
    element: ".document-tab",
    popover: {
      title: "Current document",
      description:
        "The title identifies your file. The information button shows its path and details. Unsaved marks changes still waiting to be saved. Closing a dirty file asks what to do.",
    },
  },
  {
    element: ".view-switcher",
    popover: {
      title: "Editor, Split, and Preview",
      description:
        "Editor is for writing, Preview is for reading, and Split shows both together. Available views depend on the file type. PDFs and other read-only formats use your system viewer.",
    },
  },
  {
    element: ".split-scroll-rail",
    popover: {
      title: "Follow both panes",
      description:
        "In Split, Sync scroll follows the same reading progress from either side. Turn it off to compare different parts. Drag the divider, or focus it and use Left/Right, to resize the panes.",
    },
  },
  {
    element: ".format-rail",
    popover: {
      title: "Format Markdown",
      description:
        "Apply headings, emphasis, links, lists, tables, quotes, and code fences. Markdown lists continue on Enter. Your file remains ordinary Markdown text.",
    },
  },
  {
    element: "#content-area",
    popover: {
      title: "Write and read",
      description:
        "Code files use syntax highlighting and bracket matching. Markdown preview supports tables, code blocks, and diagrams. Select preview text and use Ctrl+C (Command+C on macOS) to copy it.",
    },
  },
  {
    element: '[data-tour="search"]',
    popover: {
      title: "Find within this file",
      description:
        "Search finds text in the current editable document. Ctrl+F (Command+F on macOS) opens it; Enter advances through matches.",
    },
  },
  {
    element: ".document-action-primary",
    popover: {
      title: "Save your work",
      description:
        "Save writes changes to your file and asks for a location for a new draft. Save As creates a separate copy. If another program changed the file, Quillpane asks before overwriting it.",
    },
  },
  {
    element: '[data-tour="history"]',
    popover: {
      title: "Saved versions",
      description:
        "History shows saved snapshots with times and differences. Choose a version to inspect it, then Restore when you want its content back. Recovery drafts also help preserve unfinished work.",
    },
  },
  {
    element: '[data-tour="settings"]',
    popover: {
      title: "Make it comfortable",
      description:
        "Settings includes light/dark mode, color themes, interface scale, writing size, spacing, reading width, and the keyboard shortcut list. Changes save automatically.",
    },
  },
  {
    element: ".status-bar",
    popover: {
      title: "Status and document details",
      description:
        "The bottom bar reports actions, errors, line and word counts, and reading estimates. Watch it after saving or checking for an update.",
    },
  },
  {
    element: '[data-tour="help"]',
    popover: {
      title: "Help, tours, and updates",
      description:
        "Return here or press F1 to restart the tour, see About and version history, compare installed and latest versions, and update. Store-installed copies update through their store.",
    },
  },
  {
    popover: {
      title: "Ready to write",
      description:
        "Your notes are unchanged. Open Help → Tour whenever you want another walkthrough.",
    },
  },
];

export function ProductTour({ onClose }: { onClose(): void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    let mounted = true;
    const previousFocus = document.activeElement;
    const tour = driver({
      animate: false,
      showProgress: true,
      showButtons: ["next", "previous", "close"],
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Finish",
      popoverClass: "quillpane-tour",
      disableActiveInteraction: true,
      steps: steps.map((step) => {
        const target =
          typeof step.element === "string" ? document.querySelector(step.element) : null;
        return target?.getClientRects().length ? step : { popover: step.popover };
      }),
      onDestroyed: () => {
        if (!mounted) return;
        close.current();
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
          previousFocus.focus();
        else document.querySelector<HTMLButtonElement>('[data-tour="help"]')?.focus();
      },
    });
    // Let the Help button's click finish and its dialog unmount before the
    // tour installs document-level handlers and moves focus.
    const frame = requestAnimationFrame(() => tour.drive());
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
      if (tour.isActive()) tour.destroy();
    };
  }, []);
  return null;
}
