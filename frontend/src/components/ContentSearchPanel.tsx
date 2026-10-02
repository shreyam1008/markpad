import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  MAX_CONTENT_QUERY_LENGTH,
  searchOpenNotes,
  type OpenNoteSearchMatch,
  type SearchableNote,
} from "../workspace/content-search";
import { fileType, isReadOnly } from "../workspace/documents";
import type { NoteInfo, OpenNoteSearchCursor, OpenNoteSearchSnapshot } from "../workspace/types";
import { Search, X } from "./icons";

interface Props {
  notes: NoteInfo[];
  activeId: string;
  loadContent(id: string): Promise<string>;
  loadSnapshot(
    ids: string[],
    budgetUnits: number,
    cursor: OpenNoteSearchCursor | null,
  ): Promise<OpenNoteSearchSnapshot>;
  onSelect(match: OpenNoteSearchMatch): Promise<void>;
  onClose(): void;
}

interface Snapshot {
  key: string;
  notes: SearchableNote[];
  skipped: number;
  failed: string[];
}

interface SearchState {
  key: string;
  snapshot: Snapshot;
  query: string;
  fuzzy: boolean;
  matches: OpenNoteSearchMatch[];
  truncated: boolean;
}

interface SearchError {
  key: string;
  query: string;
  fuzzy: boolean;
  message: string;
}

const MAX_SNAPSHOT_CHARACTERS = 16 * 1024 * 1024;
const SEARCH_DELAY_MS = 80;
const EMPTY_MATCHES: OpenNoteSearchMatch[] = [];

export function ContentSearchPanel({
  notes,
  activeId,
  loadContent,
  loadSnapshot,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [fuzzy, setFuzzy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [result, setResult] = useState<SearchState>();
  const [selection, setSelection] = useState(0);
  const [opening, setOpening] = useState(false);
  const [searchError, setSearchError] = useState<SearchError>();
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(true);
  const notesRef = useRef(notes);
  const loadRef = useRef(loadContent);
  const snapshotLoadRef = useRef(loadSnapshot);
  const closeRef = useRef(onClose);
  const mounted = useRef(false);
  const instance = useId();

  useEffect(() => {
    notesRef.current = notes;
    loadRef.current = loadContent;
    snapshotLoadRef.current = loadSnapshot;
    closeRef.current = onClose;
  }, [loadContent, loadSnapshot, notes, onClose]);

  // Metadata updates keep the cached contents unless the searchable scope changes.
  const scopeKey = useMemo(
    () =>
      JSON.stringify([
        activeId,
        ...notes
          .filter((note) => !isReadOnly(fileType(note.path || note.title, note.kind)))
          .map((note) => [note.id, note.title, note.path, note.kind]),
      ]),
    [activeId, notes],
  );
  const [observedScope, setObservedScope] = useState(scopeKey);
  if (observedScope !== scopeKey) {
    setObservedScope(scopeKey);
    setSnapshot(undefined);
    setResult(undefined);
    setSearchError(undefined);
  }

  useEffect(() => {
    mounted.current = true;
    const opener = document.activeElement;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) {
        restoreFocus.current = true;
        closeRef.current();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      restoreFocus.current = true;
      closeRef.current();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      mounted.current = false;
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      if (restoreFocus.current && opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const searchable = notesRef.current.filter(
      (note) => !isReadOnly(fileType(note.path || note.title, note.kind)),
    );
    const activeIndex = searchable.findIndex((note) => note.id === activeId);
    if (activeIndex > 0) searchable.unshift(...searchable.splice(activeIndex, 1));

    const load = async () => {
      const next: Snapshot = { key: scopeKey, notes: [], skipped: 0, failed: [] };
      let characters = 0;
      const current = searchable.find((note) => note.id === activeId);
      if (current) {
        try {
          const content = await loadRef.current(current.id);
          if (cancelled) return;
          if (content.length > MAX_SNAPSHOT_CHARACTERS) {
            next.skipped++;
          } else {
            characters = content.length;
            next.notes.push({ id: current.id, title: current.title, content });
          }
        } catch {
          if (cancelled) return;
          next.failed.push(current.title);
        }
      }
      const inactive = searchable.filter((note) => note.id !== current?.id);
      if (inactive.length && characters === MAX_SNAPSHOT_CHARACTERS) {
        next.skipped += inactive.length;
      } else if (inactive.length) {
        const metadata = new Map(inactive.map((note) => [note.id, note]));
        let pending = inactive.map((note) => note.id);
        let cursor: OpenNoteSearchCursor | null = null;
        let partial: { id: string; parts: string[]; units: number } | undefined;
        try {
          while (pending.length) {
            const loaded = await snapshotLoadRef.current(
              pending,
              MAX_SNAPSHOT_CHARACTERS - characters,
              cursor,
            );
            if (cancelled) return;
            if (
              partial &&
              (loaded.failedIds.includes(partial.id) || loaded.skippedIds.includes(partial.id))
            ) {
              partial = undefined;
            }
            for (const fragment of loaded.notes) {
              const note = metadata.get(fragment.id);
              if (!note || (partial && partial.id !== note.id)) {
                throw new Error("Unexpected search fragment");
              }
              const units = (partial?.units ?? 0) + fragment.content.length;
              if (characters + units > MAX_SNAPSHOT_CHARACTERS) {
                throw new Error("Search fragment exceeded its budget");
              }
              if (!fragment.complete) {
                partial ??= { id: note.id, parts: [], units: 0 };
                partial.parts.push(fragment.content);
                partial.units = units;
              } else {
                const content = partial
                  ? [...partial.parts, fragment.content].join("")
                  : fragment.content;
                partial = undefined;
                characters += content.length;
                next.notes.push({ id: note.id, title: note.title, content });
              }
            }
            next.skipped += loaded.skippedIds.length;
            for (const id of loaded.failedIds) {
              next.failed.push(metadata.get(id)?.title ?? id);
            }
            if (!loaded.pendingIds.length && partial) throw new Error("Incomplete search note");
            const continuation = loaded.nextCursor;
            if (
              loaded.pendingIds.length >= pending.length &&
              (!continuation || continuation.offsetBytes <= (cursor?.offsetBytes ?? 0))
            ) {
              throw new Error("Search snapshot did not advance");
            }
            pending = loaded.pendingIds;
            cursor = continuation;
          }
        } catch {
          if (cancelled) return;
          next.failed.push(...pending.map((id) => metadata.get(id)?.title ?? id));
        }
      }
      if (!cancelled) setSnapshot(next);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeId, scopeKey]);

  useEffect(() => {
    const controller = new AbortController();
    if (!query.trim() || query.length > MAX_CONTENT_QUERY_LENGTH || snapshot?.key !== scopeKey) {
      return () => controller.abort();
    }
    const timer = setTimeout(() => {
      void searchOpenNotes(snapshot.notes, query, { fuzzy, signal: controller.signal })
        .then((next) => {
          if (controller.signal.aborted || next.cancelled) return;
          setResult({
            key: scopeKey,
            snapshot,
            query,
            fuzzy,
            matches: next.matches,
            truncated: next.truncated,
          });
          setSelection(0);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setSearchError({
            key: scopeKey,
            query,
            fuzzy,
            message: "Could not search open notes. Close and reopen search to retry.",
          });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fuzzy, query, scopeKey, snapshot]);

  const currentResult =
    result?.key === scopeKey &&
    result.snapshot === snapshot &&
    result.query === query &&
    result.fuzzy === fuzzy
      ? result
      : undefined;
  const rawMatches = currentResult?.matches ?? EMPTY_MATCHES;
  const grouped = useMemo(() => {
    const matches: OpenNoteSearchMatch[] = [];
    const next = new Map<
      string,
      { title: string; matches: { match: OpenNoteSearchMatch; index: number }[] }
    >();
    rawMatches.forEach((match) => {
      const groupKey = `${match.noteId}:${match.fuzzy ? "near" : "exact"}`;
      let group = next.get(groupKey);
      if (!group) {
        group = { title: match.noteTitle, matches: [] };
        next.set(groupKey, group);
      }
      group.matches.push({ match, index: 0 });
    });
    for (const group of next.values()) {
      for (const entry of group.matches) {
        entry.index = matches.length;
        matches.push(entry.match);
      }
    }
    return { groups: next, matches };
  }, [rawMatches]);
  const { groups, matches } = grouped;
  const matchedNoteCount = new Set(matches.map((match) => match.noteId)).size;
  const error =
    searchError?.key === scopeKey && searchError.query === query && searchError.fuzzy === fuzzy
      ? searchError.message
      : "";

  useEffect(() => {
    if (!matches[selection]) return;
    document
      .getElementById(`${instance}-result-${selection}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [instance, matches, selection]);

  const select = async (match: OpenNoteSearchMatch) => {
    if (opening) return;
    restoreFocus.current = false;
    setOpening(true);
    setSearchError(undefined);
    try {
      await onSelect(match);
    } catch {
      if (!mounted.current) return;
      restoreFocus.current = true;
      setSearchError({
        key: scopeKey,
        query,
        fuzzy,
        message: "Could not open this match. Close and reopen search to refresh the results.",
      });
    } finally {
      if (mounted.current) setOpening(false);
    }
  };

  const loading = snapshot?.key !== scopeKey;
  const tooLong = query.length > MAX_CONTENT_QUERY_LENGTH;
  const searching = Boolean(query.trim()) && !tooLong && !loading && !currentResult && !error;
  const ready = Boolean(query.trim()) && !tooLong && !loading && !searching;

  return (
    <aside
      ref={panel}
      id="content-search-panel"
      className="content-search-panel"
      aria-label="Search open notes"
    >
      <div className="content-search-header">
        <div className="content-search-heading">
          <Search />
          <h2>Search open notes</h2>
        </div>
        <button
          type="button"
          className="content-search-close"
          aria-label="Close open-note search"
          onClick={() => {
            restoreFocus.current = true;
            onClose();
          }}
        >
          <X />
        </button>
      </div>
      <div className="content-search-controls">
        <input
          ref={input}
          className="content-search-input"
          type="search"
          aria-label="Search open notes"
          aria-describedby={`${instance}-summary`}
          aria-controls={`${instance}-results`}
          aria-activedescendant={matches[selection] ? `${instance}-result-${selection}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Find text in open notes…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelection(0);
            setSearchError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (
              (event.ctrlKey || event.metaKey) &&
              !event.altKey &&
              (/^[zy]$/i.test(event.key) || (!event.shiftKey && /^[bik]$/i.test(event.key)))
            ) {
              // Query editing must not mutate the note behind this cached snapshot.
              event.stopPropagation();
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setSelection((value) =>
                event.key === "ArrowDown"
                  ? Math.min(value + 1, Math.max(0, matches.length - 1))
                  : Math.max(value - 1, 0),
              );
            }
            if (event.key === "Enter" && matches[selection] && !searching) {
              event.preventDefault();
              void select(matches[selection]);
            }
          }}
        />
        <div className="content-search-options">
          <label>
            <input
              type="checkbox"
              checked={fuzzy}
              onChange={(event) => {
                setFuzzy(event.target.checked);
                setSelection(0);
                setSearchError(undefined);
              }}
            />
            Allow one typo
          </label>
          <span>Single words, 4–64 characters</span>
        </div>
        <output id={`${instance}-summary`} className="content-search-summary" aria-live="polite">
          {loading
            ? "Reading open notes…"
            : searching
              ? "Searching…"
              : ready
                ? `${matches.length}${currentResult?.truncated ? "+" : ""} ${matches.length === 1 && !currentResult?.truncated ? "match" : "matches"} in ${matchedNoteCount} ${matchedNoteCount === 1 ? "note" : "notes"}`
                : `${snapshot?.notes.length ?? 0} open text ${snapshot?.notes.length === 1 ? "note" : "notes"}`}
        </output>
      </div>
      <div
        id={`${instance}-results`}
        className="content-search-results"
        aria-busy={loading || searching || opening}
      >
        {error ? (
          <p className="content-search-error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && snapshot?.failed.length ? (
          <p className="content-search-error" role="alert">
            Could not read {snapshot.failed.length}{" "}
            {snapshot.failed.length === 1 ? "note" : "notes"}:{" "}
            {snapshot.failed.slice(0, 3).join(", ")}
            {snapshot.failed.length > 3 ? `, and ${snapshot.failed.length - 3} more` : ""}. Close
            and reopen to retry.
          </p>
        ) : null}
        {!loading && snapshot?.skipped ? (
          <p className="content-search-empty">
            Search reached its memory limit. {snapshot.skipped} open{" "}
            {snapshot.skipped === 1 ? "note was" : "notes were"} not searched. Close some notes and
            reopen search.
          </p>
        ) : null}
        {tooLong ? (
          <p className="content-search-empty">Use up to {MAX_CONTENT_QUERY_LENGTH} characters.</p>
        ) : !query.trim() ? (
          <p className="content-search-empty">Find text across open notes and unsaved drafts.</p>
        ) : loading || searching ? (
          <p className="content-search-empty">{loading ? "Reading open notes…" : "Searching…"}</p>
        ) : !matches.length && !error ? (
          <p className="content-search-empty">
            No matching text in{" "}
            {snapshot?.skipped || snapshot?.failed.length ? "the searched notes" : "open notes"}.
          </p>
        ) : null}
        {ready
          ? Array.from(groups, ([noteId, group]) => (
              <section className="content-search-group" key={noteId} aria-label={group.title}>
                <h3>{group.title}</h3>
                {group.matches.map(({ match, index }) => (
                  <button
                    type="button"
                    id={`${instance}-result-${index}`}
                    key={`${match.start}-${match.end}`}
                    className={`content-search-result${index === selection ? " active" : ""}`}
                    aria-current={index === selection ? "true" : undefined}
                    aria-label={`${match.noteTitle}, line ${match.line}, column ${match.column}: ${match.snippet}${match.fuzzy ? ", near match" : ""}`}
                    disabled={opening}
                    onFocus={() => setSelection(index)}
                    onClick={() => void select(match)}
                  >
                    <span className="content-search-line">
                      Line {match.line}:{match.column}
                      {match.fuzzy ? <span className="content-search-near">Near match</span> : null}
                    </span>
                    <span className="content-search-snippet">
                      {match.snippet.slice(0, match.highlightStart)}
                      <mark>{match.snippet.slice(match.highlightStart, match.highlightEnd)}</mark>
                      {match.snippet.slice(match.highlightEnd)}
                    </span>
                  </button>
                ))}
              </section>
            ))
          : null}
        {ready && currentResult?.truncated ? (
          <p className="content-search-empty">
            Showing the first {matches.length} matches. Add more text to narrow your search.
          </p>
        ) : null}
      </div>
      <div className="content-search-footer">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> open
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
      </div>
    </aside>
  );
}
