/* oxlint-disable jsx-a11y/prefer-tag-over-role -- command palettes use the ARIA combobox/listbox pattern rather than native select semantics. */
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { fuzzyMatch, rankPaletteFiles } from "../commands";
import type { NoteInfo, WorkspaceFile } from "../workspace/types";
import { FileText, Search, SquarePen } from "./icons";

export interface PaletteAction {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  keywords?: string[];
  enabled?: boolean;
  run(): void | Promise<unknown>;
}

export type PaletteScope = "all" | "files" | "actions";

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
  scope: PaletteScope;
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
  scope,
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
    const commandPrefix = deferredQuery.trimStart().startsWith(">");
    const actionsOnly = scope === "actions" || commandPrefix;
    const filesOnly = scope === "files";
    const term = (commandPrefix ? deferredQuery.trimStart().slice(1) : deferredQuery).trim();
    const files: Result[] = actionsOnly
      ? []
      : rankPaletteFiles(term, notes, workspaceFiles, activeId).map((file) => ({
          ...file,
          shortcut: "",
          kind: "file",
          run: () =>
            file.noteId ? onActivate(file.noteId) : file.path ? onOpenPath(file.path) : undefined,
        }));
    const commands: Result[] = filesOnly
      ? []
      : actions
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
  }, [
    actions,
    activeId,
    deferredQuery,
    notes,
    onActivate,
    onOpenPath,
    open,
    scope,
    workspaceFiles,
  ]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelection(0);
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, scope]);

  useEffect(() => {
    if (!open || !results[selection]) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`command-result-${selection}`)?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, results, selection]);

  if (!open) return null;

  const run = async (result: Result) => {
    onClose();
    await result.run();
  };

  return (
    <dialog open id="command-overlay" className="command-overlay" aria-label="Command palette">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close command palette"
        className="command-backdrop"
        onClick={onClose}
      />
      <div id="command-panel" className="command-panel">
        <div className="command-search-row">
          <Search className="command-search-icon" />
          <input
            ref={input}
            className="command-input"
            placeholder={
              scope === "files"
                ? "Search open files and workspace"
                : scope === "actions"
                  ? "Search actions"
                  : "Search files and actions"
            }
            value={query}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={results[selection] ? `command-result-${selection}` : undefined}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelection(0);
            }}
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
        <div id="command-results" className="command-results" role="listbox">
          {results.length === 0 ? (
            <div className="command-empty">
              {scope === "files"
                ? "No matching files"
                : scope === "actions"
                  ? "No matching actions"
                  : "No matching files or actions"}
            </div>
          ) : null}
          {results.map((result, index) => {
            const previousKind = results[index - 1]?.kind;
            return (
              <Fragment key={result.id}>
                {previousKind !== result.kind ? (
                  <div className="command-section" aria-hidden="true">
                    {result.kind === "file" ? "Files" : "Actions"}
                  </div>
                ) : null}
                <button
                  id={`command-result-${index}`}
                  className={`command-item ${index === selection ? "active" : ""}`}
                  role="option"
                  aria-selected={index === selection}
                  onMouseMove={() => setSelection(index)}
                  onClick={() => void run(result)}
                >
                  <span className={`command-icon ${result.kind}`} aria-hidden="true">
                    {result.kind === "file" ? <FileText /> : <SquarePen />}
                  </span>
                  <span className="command-item-copy">
                    <span className="command-item-title">
                      <Highlight value={result.title} indices={result.indices} />
                    </span>
                    <span className="command-item-category">{result.category}</span>
                  </span>
                  {result.shortcut ? <kbd>{result.shortcut}</kbd> : null}
                </button>
              </Fragment>
            );
          })}
        </div>
        <div className="command-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate <kbd>Enter</kbd> open
          </span>
          {scope === "all" ? (
            <span>
              Type <kbd>&gt;</kbd> for actions
            </span>
          ) : (
            <span>{scope === "files" ? "Files" : "Actions"} only</span>
          )}
        </div>
      </div>
    </dialog>
  );
}
