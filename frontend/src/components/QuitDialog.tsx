import { useEffect, useRef } from "react";

import { AlertTriangle } from "./icons";

interface Props {
  dirtyCount: number;
  onCancel(): void;
  onDiscard(): void;
}

export function QuitDialog({ dirtyCount, onCancel, onDiscard }: Props) {
  const dialog = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => cancel.current?.focus());

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onCancel]);

  const subject = dirtyCount === 1 ? "1 file has" : `${dirtyCount} files have`;

  return (
    <div className="close-overlay">
      <section
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quit-dialog-title"
        aria-describedby="quit-dialog-description quit-dialog-note"
        className="close-dialog"
      >
        <h2 id="quit-dialog-title" className="close-dialog-title quit-dialog-title">
          <AlertTriangle />
          <span>Quit Markpad?</span>
        </h2>
        <p id="quit-dialog-description">{subject} unsaved changes.</p>
        <p id="quit-dialog-note">
          Markpad will keep recovery drafts, but it will not update your files.
        </p>
        <div className="close-actions quit-actions">
          <button ref={cancel} type="button" className="confirm-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="confirm-btn danger" onClick={onDiscard}>
            Quit Without Saving
          </button>
        </div>
      </section>
    </div>
  );
}
