import { useEffect, useState } from "react";

import { client } from "../workspace/client";
import { formatBytes } from "../workspace/documents";
import type { HistoryEntry, NoteInfo } from "../workspace/types";
import { Clock3, X } from "./icons";

interface Props {
  open: boolean;
  note?: NoteInfo;
  currentContent(): string;
  onClose(): void;
  onRestore(timestamp: string): Promise<void>;
  onStatus(status: string): void;
}

function diffLines(current: string, snapshot: string) {
  const before = snapshot.split("\n");
  const after = current.split("\n");
  const rows: { kind: "add" | "del" | "ctx"; text: string }[] = [];
  const limit = Math.max(before.length, after.length);
  for (let index = 0; index < limit; index++) {
    if (before[index] === after[index]) rows.push({ kind: "ctx", text: before[index] ?? "" });
    else {
      if (before[index] !== undefined) rows.push({ kind: "del", text: before[index] });
      if (after[index] !== undefined) rows.push({ kind: "add", text: after[index] });
    }
    if (rows.length > 1_500)
      return [{ kind: "ctx" as const, text: "Diff is too large to display safely." }];
  }
  return rows;
}

export function HistoryPanel({ open, note, currentContent, onClose, onRestore, onStatus }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry>();
  const [snapshot, setSnapshot] = useState("");

  useEffect(() => {
    if (!open || !note) return;
    setSelected(undefined);
    setSnapshot("");
    client
      .history(note.id)
      .then(setEntries)
      .catch((error) => onStatus(`History failed: ${String(error)}`));
  }, [note, onStatus, open]);

  if (!open) return null;
  const diff = selected ? diffLines(currentContent(), snapshot) : [];

  return (
    <aside
      id="history-panel"
      className="w-72 min-w-[288px] bg-sidebar border-l border-border flex flex-col"
    >
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Clock3 className="w-4 h-4 text-accent" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted">History</span>
        </div>
        <button
          className="text-muted hover:text-[#1a1c1b]"
          aria-label="Close history"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {selected && (
        <div className="px-3 py-2 border-b border-border-soft flex gap-1.5">
          <button
            className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-accent text-accent-text"
            onClick={() => void onRestore(selected.timestamp)}
          >
            Restore this version
          </button>
          <button
            className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-hover text-muted"
            onClick={() => {
              setSelected(undefined);
              setSnapshot("");
            }}
          >
            Back to current
          </button>
        </div>
      )}
      {selected ? (
        <div className="flex-1 overflow-auto p-2 font-mono text-[11px]">
          {diff.map((line, index) => (
            <div key={index} className={`diff-line diff-${line.kind}`}>
              <span>{line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}</span>
              {line.text || " "}
            </div>
          ))}
        </div>
      ) : entries.length ? (
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {entries.map((entry) => (
            <button
              key={entry.timestamp}
              className="w-full rounded-lg p-2 text-left hover:bg-hover border border-transparent hover:border-border-soft"
              onClick={async () => {
                setSelected(entry);
                setSnapshot(await client.historyContent(note?.id ?? "", entry.timestamp));
              }}
            >
              <div className="flex justify-between gap-2">
                <span className="text-xs font-semibold capitalize">{entry.source}</span>
                <span className="text-[10px] text-muted">{entry.timeAgo}</span>
              </div>
              <p className="mt-1 text-[10px] text-muted truncate">
                {entry.preview || "Empty document"}
              </p>
              <p className="mt-1 text-[10px] text-muted">
                {entry.lines} lines · {formatBytes(entry.bytes)}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted text-xs p-4 text-center">
          No history yet.
          <br />
          Versions are saved when you save the file.
        </div>
      )}
    </aside>
  );
}
