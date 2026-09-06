import { useEffect, useRef } from "react";

import { PRODUCT_NAME } from "../brand";
import { Trash2 } from "./icons";

export interface DeleteTarget {
  kind: "file" | "draft";
  name: string;
  path: string;
  dirty?: boolean;
  noteId?: string;
}

interface Props {
  target?: DeleteTarget;
  busy: boolean;
  error: string;
  onCancel(): void;
  onConfirm(): void;
}

export function DeleteDialog({ target, busy, error, onCancel, onConfirm }: Props) {
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (target) requestAnimationFrame(() => cancel.current?.focus());
  }, [target]);

  if (!target) return null;
  const permanent = target.kind === "file";

  return (
    <div className="delete-overlay">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cancel deletion"
        className="delete-backdrop"
        onClick={busy ? undefined : onCancel}
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="delete-card"
      >
        <span className="delete-icon" aria-hidden="true">
          <Trash2 />
        </span>
        <div>
          <h2 id="delete-title">Delete {permanent ? "file" : "draft"}?</h2>
          <p className="delete-name">{target.name}</p>
          <p className="delete-path">{target.path || `Unsaved ${PRODUCT_NAME} draft`}</p>
        </div>
        <div className="delete-warning">
          {permanent
            ? `This permanently removes the file from disk. ${PRODUCT_NAME} cannot undo this action.`
            : `This removes the unsaved draft from ${PRODUCT_NAME}. This action cannot be undone.`}
          {target.dirty ? " Any unsaved changes will also be lost." : ""}
        </div>
        {error ? <p className="delete-error">{error}</p> : null}
        <div className="delete-actions">
          <button
            ref={cancel}
            type="button"
            className="confirm-btn"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-btn danger-solid"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Deleting…" : permanent ? "Delete Permanently" : "Delete Draft"}
          </button>
        </div>
      </section>
    </div>
  );
}
