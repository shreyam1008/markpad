import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { fuzzyMatch, rankPaletteFiles } from "../commands";
import type { NoteInfo, WorkspaceFile } from "../workspace/types";

export interface PaletteAction {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  keywords?: string[];
  enabled?: boolean;
  run(): void | Promise<unknown>;
}

interface Result {
  id: string;
  title: string;
  category: string;
  shortcut: string;
  kind: "file" | "action";
  score: number;
  indices: number[];
  run(): void | Promise<unknown>;
}

interface Props {
  open: boolean;
  notes: NoteInfo[];
  activeId: string;
  actions: PaletteAction[];
  workspaceFiles: WorkspaceFile[];
  onClose(): void;
  onActivate(id: string): void;
  onOpenPath(path: string): void;
}

function Highlight({ value, indices }: { value: string; indices: number[] }) {
  const selected = new Set(indices);
  return (
    <>
      {value.split("").map((character, index) =>
        selected.has(index) ? (
          <mark className="command-match" key={index}>
            {character}
          </mark>
        ) : (
          character
        ),
      )}
    </>
  );
}

export function CommandPalette({
  open,
  notes,
  activeId,
  actions,
  workspaceFiles,
  onClose,
  onActivate,
  onOpenPath,
}: Props) {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!open) return [];
    const actionsOnly = deferredQuery.trimStart().startsWith(">");
    const term = (actionsOnly ? deferredQuery.trimStart().slice(1) : deferredQuery).trim();
    const files: Result[] = actionsOnly
      ? []
      : rankPaletteFiles(term, notes, workspaceFiles, activeId).map((file) => ({
          ...file,
          shortcut: "",
          kind: "file",
          run: () =>
            file.noteId ? onActivate(file.noteId) : file.path ? onOpenPath(file.path) : undefined,
        }));
    const commands: Result[] = actions
      .flatMap((action) => {
        if (action.enabled === false) return [];
        const match = fuzzyMatch(
          term,
          [action.title, action.category, ...(action.keywords ?? [])].join(" "),
        );
        const titleMatch = fuzzyMatch(term, action.title);
        if (!match) return [];
        return [
          {
            id: action.id,
            title: action.title,
            category: action.category,
            shortcut: action.shortcut ?? "",
            kind: "action" as const,
            score: match.score + (titleMatch ? 20 : 0),
            indices: titleMatch?.indices ?? [],
            run: action.run,
          },
        ];
      })
      .sort((a, b) => b.score - a.score);
    return [...files.slice(0, 60), ...commands.slice(0, 20)];
  }, [actions, activeId, deferredQuery, notes, onActivate, onOpenPath, open, workspaceFiles]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelection(0);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => setSelection(0), [query]);
  if (!open) return null;

  const run = async (result: Result) => {
    onClose();
    await result.run();
  };

  return (
    <dialog
      open
      id="command-overlay"
      className="fixed inset-0 z-[70] h-full w-full max-w-none bg-black/20 px-4 pt-[10vh]"
      aria-label="Command palette"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close command palette"
        className="command-backdrop"
        onClick={onClose}
      />
      <div
        id="command-panel"
        className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
      >
        <div className="command-search-row">
          <span className="command-prompt">›</span>
          <input
            ref={input}
            className="h-12 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted"
            placeholder="Search files and actions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelection((value) =>
                  results.length ? Math.min(value + 1, results.length - 1) : 0,
                );
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelection((value) => Math.max(value - 1, 0));
              }
              if (event.key === "Enter" && results[selection]) {
                event.preventDefault();
                void run(results[selection]);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div id="command-results" className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <div className="command-empty">No matching files or actions</div>
          )}
          {results.map((result, index) => (
            <button
              key={result.id}
              className={`command-item ${index === selection ? "active" : ""}`}
              onMouseEnter={() => setSelection(index)}
              onClick={() => void run(result)}
            >
              <span className={`command-kind ${result.kind}`}>
                {result.kind === "file" ? "FILE" : "ACTION"}
              </span>
              <span>
                <span className="command-item-title">
                  <Highlight value={result.title} indices={result.indices} />
                </span>
                <span className="command-item-category">{result.category}</span>
              </span>
              <kbd>{result.shortcut}</kbd>
            </button>
          ))}
        </div>
        <div className="command-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open
          </span>
          <span>Files + Actions</span>
        </div>
      </div>
    </dialog>
  );
}
