import { useEffect, useRef } from "react";

import { Save } from "./icons";

interface Props {
  title: string;
  onCancel(): void;
  onDiscard(): void;
  onSave(): void;
}

export function CloseDialog({ title, onCancel, onDiscard, onSave }: Props) {
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => cancel.current?.focus());
  }, []);

  return (
    <div className="close-overlay">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="close-dialog-title"
        aria-describedby="close-dialog-description"
        className="close-dialog"
      >
        <h2 id="close-dialog-title" className="close-dialog-title">
          <Save />
          <span>Save changes?</span>
        </h2>
        <p id="close-dialog-description">
          <strong>{title || "This file"}</strong> has unsaved changes.
        </p>
        <div className="close-actions">
          <button ref={cancel} type="button" className="confirm-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="confirm-btn danger" onClick={onDiscard}>
            Don&apos;t Save
          </button>
          <button type="button" className="confirm-btn primary" onClick={onSave}>
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
