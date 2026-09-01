import { useEffect, useMemo, useRef, useState } from "react";

import { diffLines, summarizeDiff } from "../history/diff";
import { client } from "../workspace/client";
import { formatBytes } from "../workspace/documents";
import type { HistoryEntry, NoteInfo } from "../workspace/types";
import { ArrowLeft, ChevronRight, Clock3, X } from "./icons";

interface Props {
  open: boolean;
  note?: NoteInfo;
  currentContent(): string;
  onClose(): void;
  onRestore(timestamp: string): Promise<void>;
  onStatus(status: string): void;
}

function snapshotTime(timestamp: string) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.valueOf())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function HistoryPanel({ open, note, currentContent, onClose, onRestore, onStatus }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry>();
  const [snapshot, setSnapshot] = useState("");
  const [loading, setLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);

  useEffect(() => {
    if (!open || !note?.id) return;
    let cancelled = false;
    const currentRequest = ++request.current;
    setSelected(undefined);
    setSnapshot("");
    setEntries([]);
    setError("");
    setLoading(true);
    client
      .history(note.id)
      .then((next) => {
        if (!cancelled && request.current === currentRequest) setEntries(next);
      })
      .catch((cause) => {
        if (cancelled || request.current !== currentRequest) return;
        const message = `History failed: ${String(cause)}`;
        setError(message);
        onStatus(message);
      })
      .finally(() => {
        if (!cancelled && request.current === currentRequest) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [note?.id, onStatus, open]);

  const liveContent = open ? currentContent() : "";
  const diff = useMemo(
    () => (selected && !snapshotLoading ? diffLines(liveContent, snapshot) : []),
    [liveContent, selected, snapshot, snapshotLoading],
  );
  const summary = useMemo(() => summarizeDiff(diff), [diff]);

  if (!open) return null;

  const selectEntry = async (entry: HistoryEntry) => {
    const currentRequest = ++request.current;
    setSelected(entry);
    setSnapshot("");
    setError("");
    setSnapshotLoading(true);
    try {
      const content = await client.historyContent(note?.id ?? "", entry.timestamp);
      if (request.current === currentRequest) setSnapshot(content);
    } catch (cause) {
      if (request.current !== currentRequest) return;
      const message = `Version failed: ${String(cause)}`;
      setError(message);
      onStatus(message);
    } finally {
      if (request.current === currentRequest) setSnapshotLoading(false);
    }
  };

  const restore = async () => {
    if (!selected || restoring) return;
    setRestoring(true);
    try {
      await onRestore(selected.timestamp);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <aside id="history-panel" className="history-panel" aria-label="Document history">
      <div className="history-header">
        <div className="history-heading">
          <Clock3 />
          <span>History</span>
        </div>
        <button
          type="button"
          className="history-close"
          aria-label="Close history"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {selected ? (
        <div className="history-version-bar">
          <button
            type="button"
            className="history-back"
            aria-label="Back to version history"
            title="Back to version history"
            onClick={() => {
              request.current++;
              setSelected(undefined);
              setSnapshot("");
              setError("");
            }}
          >
            <ArrowLeft />
            Back
          </button>
          <span className="history-version-time" title={selected.timestamp}>
            {snapshotTime(selected.timestamp)}
          </span>
          <button
            type="button"
            className="history-restore"
            disabled={restoring || snapshotLoading || Boolean(error)}
            onClick={() => void restore()}
          >
            {restoring ? "Restoring…" : "Restore"}
          </button>
        </div>
      ) : null}
      {selected ? (
        <section
          className="history-diff"
          aria-label="Differences between the saved version and current document"
        >
          <div className="history-diff-summary">
            <span className="history-diff-direction">Saved version → Current</span>
            <span className="history-additions">
              <strong>+{summary.additions}</strong> additions
            </span>
            <span className="history-deletions">
              <strong>−{summary.deletions}</strong> deletions
            </span>
          </div>
          {snapshotLoading ? <div className="history-state">Loading version…</div> : null}
          {error ? <div className="history-state history-error">{error}</div> : null}
          {!snapshotLoading && !error ? (
            <ol className="history-diff-lines" aria-label="Line differences">
              {diff.map((line, index) => (
                <li
                  key={`${index}-${line.kind}`}
                  className={`diff-line diff-${line.kind}`}
                  aria-label={`${line.kind === "add" ? "Added" : line.kind === "del" ? "Deleted" : "Unchanged"} line: ${line.text || "blank"}`}
                >
                  <span className="diff-line-number" aria-hidden="true">
                    {line.beforeLine ?? ""}
                  </span>
                  <span className="diff-line-number" aria-hidden="true">
                    {line.afterLine ?? ""}
                  </span>
                  <span className="diff-gutter" aria-hidden="true">
                    {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                  </span>
                  <code aria-hidden="true">{line.text || " "}</code>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : loading ? (
        <div className="history-state">Loading history…</div>
      ) : error ? (
        <div className="history-state history-error">{error}</div>
      ) : entries.length ? (
        <div className="history-list">
          {entries.map((entry) => (
            <button
              type="button"
              key={entry.timestamp}
              className="history-entry"
              title={`${entry.source} · ${snapshotTime(entry.timestamp)}`}
              onClick={() => void selectEntry(entry)}
            >
              <span className="history-timeline" aria-hidden="true">
                <span />
              </span>
              <span className="history-entry-copy">
                <span className="history-entry-topline">
                  <strong>{entry.source}</strong>
                  <time dateTime={entry.timestamp}>{entry.timeAgo}</time>
                </span>
                <span className="history-preview">{entry.preview || "Empty document"}</span>
                <span className="history-meta">
                  {entry.lines} lines · {formatBytes(entry.bytes)} · {snapshotTime(entry.timestamp)}
                </span>
              </span>
              <ChevronRight className="history-entry-arrow" />
            </button>
          ))}
        </div>
      ) : (
        <div className="history-state">
          <strong>No versions yet</strong>
          <span>Versions appear after you save the file.</span>
        </div>
      )}
    </aside>
  );
}
