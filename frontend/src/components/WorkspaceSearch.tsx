import { useEffect, useRef, useState } from "react";

import { PRODUCT_NAME } from "../brand";
import { client } from "../workspace/client";
import { searchResultKey, splitSearchHighlight } from "../workspace/search";
import type { WorkspaceSearchResult, WorkspaceState } from "../workspace/types";
import { Search, X } from "./icons";

const SEARCH_DELAY = 120;

interface Props {
  open: boolean;
  workspace: WorkspaceState;
  onClose(): void;
  onChooseWorkspace(): void;
  onOpen(result: WorkspaceSearchResult): void | Promise<void>;
}

type SearchPhase = "idle" | "loading" | "ready" | "error";

function SearchResultRow({
  result,
  active,
  index,
  id,
  onHover,
  onOpen,
}: {
  result: WorkspaceSearchResult;
  active: boolean;
  index: number;
  id: string;
  onHover(index: number): void;
  onOpen(result: WorkspaceSearchResult): void;
}) {
  const parts = splitSearchHighlight(result.text, result.matchStart, result.matchEnd);
  const slash = Math.max(result.relative.lastIndexOf("/"), result.relative.lastIndexOf("\\"));
  const fileName = slash >= 0 ? result.relative.slice(slash + 1) : result.relative;
  const folder = slash >= 0 ? result.relative.slice(0, slash) : "Workspace root";

  return (
    <button
      type="button"
      id={id}
      data-search-index={index}
      className={`workspace-search-result ${active ? "active" : ""}`}
      aria-current={active ? "true" : undefined}
      onMouseEnter={() => onHover(index)}
      onFocus={() => onHover(index)}
      onClick={() => onOpen(result)}
    >
      <span className="workspace-search-location">
        <strong>{fileName}</strong>
        <span>{folder}</span>
        <span className="workspace-search-line">Ln {result.line}</span>
      </span>
      <span className="workspace-search-snippet">
        {parts.before}
        <mark>{parts.match}</mark>
        {parts.after}
      </span>
    </button>
  );
}

export function WorkspaceSearch({ open, workspace, onClose, onChooseWorkspace, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [selection, setSelection] = useState(0);
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [error, setError] = useState("");
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const chooseFolder = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => (workspace.root ? input.current : chooseFolder.current)?.focus());
  }, [open, workspace.root]);

  useEffect(() => {
    if (!open || !workspace.root) return;
    const term = query.trim();
    const requestID = ++request.current;
    let cancelled = false;
    if (!term) {
      setResults([]);
      setSelection(0);
      setError("");
      setPhase("idle");
      return;
    }
    setResults([]);
    setSelection(0);
    setPhase("loading");
    const timer = setTimeout(() => {
      void client
        .searchWorkspace(term)
        .then((next) => {
          if (cancelled || request.current !== requestID) return;
          setResults(next);
          setSelection(0);
          setError("");
          setPhase("ready");
        })
        .catch((reason: unknown) => {
          if (cancelled || request.current !== requestID) return;
          setResults([]);
          setError(reason instanceof Error ? reason.message : String(reason));
          setPhase("error");
        });
    }, SEARCH_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, workspace.root]);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-search-index="${selection}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selection]);

  if (!open) return null;

  const openSelected = () => {
    const result = results[selection];
    if (result) void onOpen(result);
  };

  return (
    <div className="workspace-search-overlay">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close workspace search"
        className="workspace-search-backdrop"
        onClick={onClose}
      />
      <dialog open aria-labelledby="workspace-search-title" className="workspace-search-panel">
        <header className="workspace-search-header">
          <div>
            <p>Find in folder</p>
            <h2 id="workspace-search-title">{workspace.name || "Workspace search"}</h2>
            {workspace.root ? <span title={workspace.root}>{workspace.root}</span> : null}
          </div>
          <button type="button" className="icon-btn" aria-label="Close search" onClick={onClose}>
            <X />
          </button>
        </header>

        {workspace.root ? (
          <>
            <div className="workspace-search-input-row">
              <Search className="h-4 w-4" />
              <input
                ref={input}
                value={query}
                aria-label="Search text in workspace"
                aria-controls="workspace-search-results"
                maxLength={256}
                placeholder="Search every text file…"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelection((value) =>
                      results.length ? Math.min(value + 1, results.length - 1) : 0,
                    );
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelection((value) => Math.max(value - 1, 0));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    openSelected();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    onClose();
                  }
                }}
              />
              {phase === "loading" ? (
                <span className="workspace-search-progress">Searching…</span>
              ) : null}
              <kbd>Ctrl Shift F</kbd>
            </div>
            <div
              ref={list}
              id="workspace-search-results"
              className="workspace-search-results"
              aria-label="Workspace search results"
              aria-busy={phase === "loading"}
            >
              {phase === "idle" ? (
                <div className="workspace-search-empty">
                  <Search />
                  <strong>Search the whole folder</strong>
                  <span>
                    Type a word or phrase. Results include the matching line and location.
                  </span>
                </div>
              ) : null}
              {phase === "error" ? (
                <div className="workspace-search-empty error" role="alert">
                  <strong>Search could not finish</strong>
                  <span>{error}</span>
                </div>
              ) : null}
              {phase === "ready" && results.length === 0 ? (
                <div className="workspace-search-empty">
                  <strong>No matches for “{query.trim()}”</strong>
                  <span>Try a shorter phrase or refresh the folder.</span>
                </div>
              ) : null}
              {results.map((result, index) => (
                <SearchResultRow
                  key={searchResultKey(result)}
                  id={`workspace-result-${index}`}
                  result={result}
                  index={index}
                  active={index === selection}
                  onHover={setSelection}
                  onOpen={(next) => void onOpen(next)}
                />
              ))}
            </div>
            <footer className="workspace-search-footer">
              <span>
                {phase === "ready"
                  ? `${results.length}${results.length === 200 ? "+" : ""} result${results.length === 1 ? "" : "s"}`
                  : `${workspace.files.length} indexed file${workspace.files.length === 1 ? "" : "s"}`}
              </span>
              <span>
                <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open and select
              </span>
            </footer>
          </>
        ) : (
          <div className="workspace-search-empty no-folder">
            <strong>Choose a folder first</strong>
            <span>
              {PRODUCT_NAME} searches local text files without creating an index or database.
            </span>
            <button
              ref={chooseFolder}
              type="button"
              className="confirm-btn primary"
              onClick={onChooseWorkspace}
            >
              Choose Folder
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
