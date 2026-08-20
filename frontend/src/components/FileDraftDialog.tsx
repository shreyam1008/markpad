import { useEffect, useRef, useState } from "react";

import { FilePlus2 } from "./icons";

export interface FileDraftTarget {
  suggestion: string;
  workspaceName: string;
  workspaceRoot: string;
}

interface Props {
  target?: FileDraftTarget;
  busy: boolean;
  error: string;
  onCancel(): void;
  onConfirm(relativePath: string): void;
}

export function FileDraftDialog({ target, busy, error, onCancel, onConfirm }: Props) {
  const [relativePath, setRelativePath] = useState(target?.suggestion ?? "");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRelativePath(target?.suggestion ?? "");
    if (target) requestAnimationFrame(() => input.current?.select());
  }, [target]);

  if (!target) return null;

  return (
    <div className="file-draft-overlay">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cancel filing draft"
        className="file-draft-backdrop"
        onClick={busy ? undefined : onCancel}
      />
      <dialog
        open
        aria-modal="true"
        aria-labelledby="file-draft-title"
        aria-describedby="file-draft-description file-draft-hint"
        className="file-draft-card"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onCancel();
        }}
      >
        <span className="file-draft-icon" aria-hidden="true">
          <FilePlus2 />
        </span>
        <div>
          <p className="file-draft-kicker">Workspace filing slip</p>
          <h2 id="file-draft-title">File this draft in {target.workspaceName}</h2>
          <p id="file-draft-description">
            Turn the recovery draft into an ordinary local file without leaving Markpad.
          </p>
        </div>
        <form
          className="file-draft-form"
          onSubmit={(event) => {
            event.preventDefault();
            const path = relativePath.trim();
            if (path && !busy) onConfirm(path);
          }}
        >
          <label htmlFor="file-draft-path">Path inside the workspace</label>
          <div className="file-draft-path-field">
            <span aria-hidden="true">{target.workspaceName}/</span>
            <input
              ref={input}
              id="file-draft-path"
              value={relativePath}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setRelativePath(event.target.value)}
            />
          </div>
          <p className="file-draft-root" title={target.workspaceRoot}>
            {target.workspaceRoot}
          </p>
          <p id="file-draft-hint" className="file-draft-hint">
            The suggestion comes from the first useful line. Add folders if needed; existing files
            are never overwritten.
          </p>
          {error ? (
            <p className="file-draft-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="file-draft-actions">
            <button type="button" className="confirm-btn" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="confirm-btn primary" disabled={busy}>
              {busy ? "Filing…" : "File Draft"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
