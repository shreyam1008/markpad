import { useEffect, useRef } from "react";

import type { SaveConflictInfo } from "../workspace/types";
import { Copy, RefreshCw, Save } from "./icons";

type Resolution = "copy" | "reload" | "overwrite" | "";

interface Props {
  conflict?: SaveConflictInfo;
  busy: Resolution;
  error: string;
  onCancel(): void;
  onSaveCopy(): void;
  onReload(): void;
  onOverwrite(): void;
}

const conflictCopy: Record<SaveConflictInfo["kind"], string> = {
  modified: "Another app changed this file after Markpad opened it.",
  deleted: "This file was deleted or moved after Markpad opened it.",
  replaced: "This path is no longer the regular file Markpad opened.",
  unverified: "This restored draft predates Markpad’s file-version safety record.",
};

export function SaveConflictDialog({
  conflict,
  busy,
  error,
  onCancel,
  onSaveCopy,
  onReload,
  onOverwrite,
}: Props) {
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (conflict) requestAnimationFrame(() => cancel.current?.focus());
  }, [conflict]);

  useEffect(() => {
    if (!conflict || busy) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [busy, conflict, onCancel]);

  if (!conflict) return null;
  const modified = conflict.modified ? new Date(conflict.modified) : undefined;
  const modifiedLabel =
    modified && Number.isFinite(modified.getTime()) ? modified.toLocaleString() : "";
  const locked = busy !== "";

  return (
    <div className="save-conflict-overlay">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Keep editing without saving"
        className="save-conflict-backdrop"
        onClick={locked ? undefined : onCancel}
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="save-conflict-title"
        aria-describedby="save-conflict-summary save-conflict-safety"
        className="save-conflict-card"
      >
        <span className="save-conflict-icon" aria-hidden="true">
          <RefreshCw />
        </span>
        <div>
          <p className="save-conflict-kicker">Save paused</p>
          <h2 id="save-conflict-title">The file changed outside Markpad</h2>
          <p className="save-conflict-path">{conflict.path}</p>
          {modifiedLabel ? <p className="save-conflict-time">Changed {modifiedLabel}</p> : null}
        </div>
        <p id="save-conflict-summary" className="save-conflict-summary">
          {conflictCopy[conflict.kind]}
        </p>
        <p id="save-conflict-safety" className="save-conflict-safety">
          Your Markpad draft is safe. Reload stores it in Version History before showing the disk
          version.
        </p>
        {error ? (
          <p className="save-conflict-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="save-conflict-actions">
          <button
            ref={cancel}
            type="button"
            className="confirm-btn"
            disabled={locked}
            onClick={onCancel}
          >
            Keep Editing
          </button>
          <button type="button" className="confirm-btn" disabled={locked} onClick={onSaveCopy}>
            <Copy />
            {busy === "copy" ? "Opening…" : "Save a Copy"}
          </button>
          {conflict.kind !== "deleted" ? (
            <button type="button" className="confirm-btn" disabled={locked} onClick={onReload}>
              <RefreshCw />
              {busy === "reload" ? "Reloading…" : "Reload Disk Version"}
            </button>
          ) : null}
          <button
            type="button"
            className="confirm-btn danger-solid"
            disabled={locked}
            onClick={onOverwrite}
          >
            <Save />
            {busy === "overwrite"
              ? conflict.kind === "deleted"
                ? "Recreating…"
                : "Overwriting…"
              : conflict.kind === "deleted"
                ? "Recreate File"
                : "Overwrite Disk Version"}
          </button>
        </div>
      </section>
    </div>
  );
}
