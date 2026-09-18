import { PRODUCT_NAME } from "../brand";
import type { SaveConflictInfo } from "../workspace/types";
import { AlertTriangle, RefreshCw, X } from "./icons";

interface Props {
  conflict: SaveConflictInfo;
  busy: boolean;
  error: string;
  onKeepEditing(): void;
  onReload(): void;
}

const copy: Record<SaveConflictInfo["kind"], string> = {
  modified: "Another app saved a newer version of this file.",
  deleted: "This file was deleted or moved outside the app.",
  replaced: "This path now points to a different file.",
  unverified: "The file version could not be verified after recovery.",
};

export function ExternalChangeBanner({ conflict, busy, error, onKeepEditing, onReload }: Props) {
  return (
    <section className="external-change-banner" role="alert" aria-live="assertive">
      <span className="external-change-icon" aria-hidden="true">
        <AlertTriangle />
      </span>
      <div className="external-change-copy">
        <strong>File changed outside {PRODUCT_NAME}</strong>
        <span>{copy[conflict.kind]}</span>
        <code title={conflict.path}>{conflict.path}</code>
        {error ? <span className="external-change-error">{error}</span> : null}
      </div>
      <button
        type="button"
        className="external-change-dismiss"
        aria-label="Keep editing this version"
        title="Keep editing this version"
        onClick={onKeepEditing}
        disabled={busy}
      >
        <X />
      </button>
      {conflict.kind !== "deleted" ? (
        <button type="button" className="confirm-btn primary" onClick={onReload} disabled={busy}>
          <RefreshCw />
          {busy ? "Reloading..." : "Reload disk version"}
        </button>
      ) : null}
    </section>
  );
}
