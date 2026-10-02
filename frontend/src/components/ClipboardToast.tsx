import { useEffect, useState } from "react";

import { subscribeClipboardCopies } from "../preview/clipboard";

export function ClipboardToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    let version = 0;
    let hideTimer: ReturnType<typeof setTimeout>;
    let copyTimer: ReturnType<typeof setTimeout>;
    const show = () => {
      version++;
      clearTimeout(copyTimer);
      clearTimeout(hideTimer);
      setVisible(true);
      hideTimer = setTimeout(() => setVisible(false), 1000);
    };
    const unsubscribe = subscribeClipboardCopies(show);
    const copy = (event: ClipboardEvent) => {
      const suppliedText = event.clipboardData?.types.includes("text/plain");
      let text = event.clipboardData?.getData("text/plain") || "";
      if (!suppliedText && !event.defaultPrevented) {
        const target = event.target;
        text =
          target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
            ? target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0)
            : window.getSelection()?.toString() || "";
      }
      if (!suppliedText && !text) return;
      const current = ++version;
      clearTimeout(copyTimer);
      let attempts = 0;
      // Leave editor copy untouched, then verify the OS clipboard after its default action.
      const verify = () => {
        if (!mounted || current !== version) return;
        const read = window.runtime?.ClipboardGetText;
        if (!read) {
          show();
          return;
        }
        const retry = () => {
          if (mounted && current === version && ++attempts < 3) copyTimer = setTimeout(verify, 25);
        };
        void read().then((copied) => {
          if (!mounted || current !== version) return;
          if (copied.replace(/\r\n/g, "\n") === text.replace(/\r\n/g, "\n")) show();
          else retry();
        }, retry);
      };
      copyTimer = setTimeout(verify, 0);
    };
    window.addEventListener("copy", copy);
    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener("copy", copy);
      clearTimeout(copyTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <output className="clipboard-toast" aria-live="polite" aria-atomic="true">
      {visible && <span className="clipboard-toast-message">Copied to clipboard</span>}
    </output>
  );
}
