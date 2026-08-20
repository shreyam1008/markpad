import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { renderCode, renderMarkdown } from "../preview/render";
import { client } from "../workspace/client";
import {
  editorStats,
  fileType,
  formatBytes,
  imageMime,
  isReadOnly,
  outlineFromMarkdown,
  typeLabel,
} from "../workspace/documents";
import { matchSelectionOffset } from "../workspace/search";
import type {
  NoteInfo,
  OutlineItem,
  SaveConflictInfo,
  SessionState,
  ViewMode,
} from "../workspace/types";
import { SaveConflictDialog } from "./SaveConflictDialog";

const DRAFT_DELAY = 350;
const PREVIEW_DELAY = 120;
const HISTORY_LIMIT = 80;
const HISTORY_CHAR_LIMIT = 1_000_000;

interface EditState {
  content: string;
  start: number;
  end: number;
}

export interface DocumentWorkspaceHandle {
  flush(): Promise<void>;
  save(): Promise<boolean>;
  saveAs(): Promise<boolean>;
  revert(): Promise<void>;
  undo(): void;
  redo(): void;
  format(action: string): void;
  findNext(query: string): { index: number; count: number };
  goToLine(line: number): void;
  revealMatch(line: number, column: number, length: number): void;
  getContent(): string;
}

interface Props {
  note?: NoteInfo;
  initialContent: string;
  viewMode: ViewMode;
  textSize: number;
  findOpen: boolean;
  onCloseFind(): void;
  onSession(session: SessionState): void;
  onDocument(session: SessionState, status: string): void | Promise<void>;
  onWorkspaceChange(): void | Promise<void>;
  onDirty(dirty: boolean): void;
  onStatus(status: string): void;
  onStats(stats: string): void;
  onOutline(outline: OutlineItem[]): void;
  onHistoryAvailability(undo: boolean, redo: boolean): void;
  onTextZoom(direction: number): void;
}

function Viewer({
  note,
  content,
  textSize,
}: {
  note?: NoteInfo;
  content: string;
  textSize: number;
}) {
  const type = fileType(note?.path, note?.kind);
  const [image, setImage] = useState("");
  const rendered = useRef<HTMLDivElement>(null);
  const html = useMemo(() => {
    if (type === "md") return renderMarkdown(content);
    if (type === "code") return renderCode(content, note?.path ?? "");
    return "";
  }, [content, note?.path, type]);

  useEffect(() => {
    let active = true;
    setImage("");
    if (type === "image" && note?.path) {
      client
        .readBase64(note.path)
        .then((data) => active && setImage(data))
        .catch(() => active && setImage(""));
    }
    return () => {
      active = false;
    };
  }, [note?.path, type]);

  useEffect(() => {
    const target = rendered.current;
    if (!target || (type !== "md" && type !== "code")) return;
    const openLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor?.href) return;
      event.preventDefault();
      void client.openURL(anchor.href);
    };
    target.addEventListener("click", openLink);
    return () => target.removeEventListener("click", openLink);
  }, [type]);

  if (type === "md" || type === "code") {
    return (
      <div
        ref={rendered}
        id="viewer"
        role="document"
        className="markdown-body bg-editor rounded-lg p-6 min-h-full select-text"
        style={{ "--markpad-text-size": `${textSize}px` } as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (type === "text") {
    return (
      <div
        id="viewer"
        className="markdown-body bg-editor rounded-lg p-6 min-h-full select-text"
        style={{ fontSize: textSize }}
      >
        <pre className="plain-text-view">{content}</pre>
      </div>
    );
  }
  if (type === "image") {
    return (
      <div
        id="viewer"
        className="bg-editor rounded-lg p-6 min-h-full flex flex-col items-center justify-center gap-4"
      >
        {image ? (
          <img
            src={`data:${imageMime(note?.path ?? "")};base64,${image}`}
            className="max-w-full max-h-full object-contain"
            alt={note?.title ?? "Image"}
          />
        ) : (
          <p className="text-muted text-sm">Loading image…</p>
        )}
        <button
          className="confirm-btn primary"
          onClick={() => note?.path && void client.openExternal(note.path)}
        >
          Open externally
        </button>
      </div>
    );
  }
  return (
    <div
      id="viewer"
      className="bg-editor rounded-lg p-8 min-h-full flex items-center justify-center"
    >
      <div className="max-w-md text-center">
        <div className="file-badge mx-auto mb-4">{type.toUpperCase()}</div>
        <h2 className="text-lg font-bold mb-2">{note?.title || typeLabel(type)}</h2>
        <p className="text-sm text-muted mb-1">
          {type === "pdf"
            ? "PDF files open in your system viewer."
            : "This document is read-only in Markpad."}
        </p>
        {note?.size ? <p className="text-xs text-muted mb-5">{formatBytes(note.size)}</p> : null}
        <button
          className="confirm-btn primary"
          onClick={() => note?.path && void client.openExternal(note.path)}
        >
          Open externally
        </button>
      </div>
    </div>
  );
}

export const DocumentWorkspace = forwardRef<DocumentWorkspaceHandle, Props>(
  function DocumentWorkspace(
    {
      note,
      initialContent,
      viewMode,
      textSize,
      findOpen,
      onCloseFind,
      onSession,
      onDocument,
      onWorkspaceChange,
      onDirty,
      onStatus,
      onStats,
      onOutline,
      onHistoryAvailability,
      onTextZoom,
    },
    ref,
  ) {
    const [content, setContent] = useState(initialContent);
    const [previewContent, setPreviewContent] = useState(initialContent);
    const [findQuery, setFindQuery] = useState("");
    const [findInfo, setFindInfo] = useState("");
    const [split, setSplit] = useState(50);
    const [saveConflict, setSaveConflict] = useState<SaveConflictInfo>();
    const [saveConflictBusy, setSaveConflictBusy] = useState<"" | "copy" | "reload" | "overwrite">(
      "",
    );
    const [saveConflictError, setSaveConflictError] = useState("");
    const editor = useRef<HTMLTextAreaElement>(null);
    const viewer = useRef<HTMLDivElement>(null);
    const area = useRef<HTMLDivElement>(null);
    const findInput = useRef<HTMLInputElement>(null);
    const committed = useRef(initialContent);
    const committedDirty = useRef(note?.dirty ?? false);
    const initialDocument = useRef({
      dirty: note?.dirty ?? false,
      cursor: note?.cursor ?? 0,
      scrollTop: note?.scrollTop ?? 0,
      viewTop: note?.viewTop ?? 0,
    });
    const contentRef = useRef(initialContent);
    const dirtyRef = useRef(note?.dirty ?? false);
    const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const history = useRef<EditState[]>([
      {
        content: initialContent,
        start: note?.cursor ?? 0,
        end: note?.cursor ?? 0,
      },
    ]);
    const historyIndex = useRef(0);
    const resizing = useRef(false);
    const type = fileType(note?.path, note?.kind);
    const readOnly = isReadOnly(type);

    const updateHistoryButtons = useCallback(() => {
      onHistoryAvailability(
        historyIndex.current > 0,
        historyIndex.current < history.current.length - 1,
      );
    }, [onHistoryAvailability]);

    useEffect(() => {
      if (findOpen) requestAnimationFrame(() => findInput.current?.focus());
    }, [findOpen]);

    useEffect(() => {
      const initial = initialDocument.current;
      onDirty(initial.dirty);
      updateHistoryButtons();
      requestAnimationFrame(() => {
        if (editor.current) {
          editor.current.scrollTop = initial.scrollTop;
          editor.current.selectionStart = editor.current.selectionEnd = Math.min(
            initial.cursor,
            initialContent.length,
          );
        }
        if (viewer.current) viewer.current.scrollTop = initial.viewTop;
      });
    }, [initialContent.length, onDirty, updateHistoryButtons]);

    useEffect(() => {
      const stats = editorStats(content, note);
      onStats(
        readOnly
          ? `${typeLabel(type)} · ${note?.size ? formatBytes(note.size) : "read-only"}`
          : `${stats.label} · ${stats.lines} ln · ${stats.words} w · ${stats.characters} ch · ~${stats.readMinutes} min · UTF-8`,
      );
      onOutline(type === "md" ? outlineFromMarkdown(content) : []);
    }, [content, note, onOutline, onStats, readOnly, type]);

    useEffect(() => {
      clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => setPreviewContent(content), PREVIEW_DELAY);
      return () => clearTimeout(previewTimer.current);
    }, [content]);

    useEffect(() => {
      const target = area.current;
      if (!target) return;
      let capture = false;
      let delta = 0;
      const wheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        delta += event.deltaY;
        if (Math.abs(delta) < 30) return;
        onTextZoom(delta < 0 ? 1 : -1);
        delta = 0;
      };
      const down = (event: KeyboardEvent) => {
        if ((event.key === "Control" || event.key === "Meta") && !capture) {
          target.addEventListener("wheel", wheel, { passive: false });
          capture = true;
        }
      };
      const up = (event: KeyboardEvent) => {
        if ((event.key === "Control" || event.key === "Meta") && capture) {
          target.removeEventListener("wheel", wheel);
          capture = false;
        }
      };
      window.addEventListener("keydown", down, true);
      window.addEventListener("keyup", up, true);
      return () => {
        target.removeEventListener("wheel", wheel);
        window.removeEventListener("keydown", down, true);
        window.removeEventListener("keyup", up, true);
      };
    }, [onTextZoom]);

    const savePosition = useCallback(() => {
      if (!note?.id) return;
      clearTimeout(readTimer.current);
      readTimer.current = setTimeout(() => {
        void client.updateReadPosition(
          note.id,
          editor.current?.scrollTop ?? 0,
          viewer.current?.scrollTop ?? 0,
          editor.current?.selectionStart ?? 0,
        );
      }, 180);
    }, [note?.id]);

    const flush = useCallback(async () => {
      clearTimeout(draftTimer.current);
      if (note?.id && !readOnly) {
        await client.updateDraft(note.id, contentRef.current, dirtyRef.current);
      }
      if (note?.id) {
        await client.updateReadPosition(
          note.id,
          editor.current?.scrollTop ?? 0,
          viewer.current?.scrollTop ?? 0,
          editor.current?.selectionStart ?? 0,
        );
      }
    }, [note?.id, readOnly]);

    const record = useCallback(
      (value: string, start: number, end: number) => {
        if (history.current[historyIndex.current]?.content === value) return;
        history.current = history.current.slice(0, historyIndex.current + 1);
        history.current.push({ content: value, start, end });
        historyIndex.current = history.current.length - 1;
        while (
          history.current.length > HISTORY_LIMIT ||
          history.current.reduce((sum, item) => sum + item.content.length, 0) > HISTORY_CHAR_LIMIT
        ) {
          if (history.current.length <= 2) break;
          history.current.shift();
          historyIndex.current--;
        }
        updateHistoryButtons();
      },
      [updateHistoryButtons],
    );

    const changeContent = useCallback(
      (value: string, start?: number, end?: number) => {
        if (readOnly) return;
        setContent(value);
        contentRef.current = value;
        const dirty = committedDirty.current || value !== committed.current;
        dirtyRef.current = dirty;
        onDirty(dirty);
        record(
          value,
          start ?? editor.current?.selectionStart ?? 0,
          end ?? editor.current?.selectionEnd ?? 0,
        );
        if (note && dirty && !note.dirty) void client.markDirty(note.id);
        clearTimeout(draftTimer.current);
        if (note) {
          draftTimer.current = setTimeout(async () => {
            await client.updateDraft(note.id, contentRef.current, dirtyRef.current);
            onSession(await client.session());
          }, DRAFT_DELAY);
        }
      },
      [note, onDirty, onSession, readOnly, record],
    );

    const stepHistory = useCallback(
      (direction: number) => {
        const next = historyIndex.current + direction;
        if (next < 0 || next >= history.current.length) return;
        historyIndex.current = next;
        const state = history.current[next];
        setContent(state.content);
        contentRef.current = state.content;
        const dirty = committedDirty.current || state.content !== committed.current;
        dirtyRef.current = dirty;
        onDirty(dirty);
        requestAnimationFrame(() => {
          if (!editor.current) return;
          editor.current.selectionStart = state.start;
          editor.current.selectionEnd = state.end;
          editor.current.focus();
        });
        updateHistoryButtons();
      },
      [onDirty, updateHistoryButtons],
    );

    const format = useCallback(
      (action: string) => {
        const input = editor.current;
        if (!input) return;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const selection = contentRef.current.slice(start, end);
        let inserted = "";
        let cursor = 0;
        const wrap = (before: string, fallback: string, after: string) => {
          inserted = before + (selection || fallback) + after;
          cursor = selection ? inserted.length : before.length;
        };
        const prefix = (before: string, fallback: string) => {
          inserted = before + (selection || fallback);
          cursor = inserted.length;
        };
        switch (action) {
          case "bold":
            wrap("**", "bold", "**");
            break;
          case "italic":
            wrap("_", "italic", "_");
            break;
          case "strikethrough":
            wrap("~~", "text", "~~");
            break;
          case "h1":
            prefix("# ", "Heading");
            break;
          case "h2":
            prefix("## ", "Heading");
            break;
          case "h3":
            prefix("### ", "Heading");
            break;
          case "code":
            wrap("`", "code", "`");
            break;
          case "codeblock":
            inserted = `\n\`\`\`\n${selection || "code"}\n\`\`\`\n`;
            cursor = 5;
            break;
          case "link":
            inserted = `[${selection || "text"}](url)`;
            cursor = selection ? inserted.length - 1 : 1;
            break;
          case "image":
            inserted = `![${selection || "alt"}](url)`;
            cursor = selection ? inserted.length - 1 : 2;
            break;
          case "ul":
            prefix("- ", "item");
            break;
          case "ol":
            prefix("1. ", "item");
            break;
          case "task":
            prefix("- [ ] ", "task");
            break;
          case "table":
            inserted = "\n| Column | Column |\n| --- | --- |\n| Cell | Cell |\n";
            cursor = inserted.length;
            break;
          case "hr":
            inserted = "\n---\n";
            cursor = inserted.length;
            break;
          case "quote":
            prefix("> ", "quote");
            break;
          default:
            return;
        }
        const value = contentRef.current.slice(0, start) + inserted + contentRef.current.slice(end);
        changeContent(value, start + cursor, start + cursor);
        requestAnimationFrame(() => {
          if (!editor.current) return;
          editor.current.selectionStart = editor.current.selectionEnd = start + cursor;
          editor.current.focus();
        });
      },
      [changeContent],
    );

    const findNext = useCallback((query: string) => {
      const input = editor.current;
      if (!input || !query) {
        setFindInfo("");
        return { index: 0, count: 0 };
      }
      const haystack = contentRef.current.toLowerCase();
      const needle = query.toLowerCase();
      const matches: number[] = [];
      let offset = 0;
      while ((offset = haystack.indexOf(needle, offset)) >= 0) {
        matches.push(offset);
        offset += Math.max(needle.length, 1);
      }
      if (!matches.length) {
        setFindInfo("No results");
        return { index: 0, count: 0 };
      }
      const next = matches.findIndex((position) => position >= input.selectionEnd);
      const selected = next >= 0 ? next : 0;
      input.focus();
      input.setSelectionRange(matches[selected], matches[selected] + query.length);
      setFindInfo(`${selected + 1} of ${matches.length}`);
      return { index: selected, count: matches.length };
    }, []);

    const revealMatch = useCallback(
      (line: number, column: number, length: number) => {
        const input = editor.current;
        if (!input) return;
        const targetLine = Math.max(1, Math.trunc(line));
        const start = matchSelectionOffset(contentRef.current, targetLine, column);
        const end = Math.max(
          start,
          Math.min(contentRef.current.length, start + Math.max(0, length)),
        );
        input.focus();
        input.setSelectionRange(start, end);
        const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 28;
        input.scrollTop = Math.max(0, (targetLine - 1) * lineHeight - input.clientHeight / 3);
        savePosition();
      },
      [savePosition],
    );

    const acceptSavedSession = useCallback(
      (session: SessionState, status = "Saved") => {
        const active = session.notes.find((item) => item.id === session.activeId);
        if (active?.dirty) return false;
        committed.current = contentRef.current;
        committedDirty.current = false;
        dirtyRef.current = false;
        onDirty(false);
        onSession(session);
        onStatus(status);
        setSaveConflict(undefined);
        setSaveConflictError("");
        return true;
      },
      [onDirty, onSession, onStatus],
    );

    const saveCurrent = useCallback(
      async (overwrite = false) => {
        if (readOnly) return false;
        onStatus(overwrite ? "Overwriting changed file…" : "Saving…");
        try {
          const result = await client.save(contentRef.current, overwrite);
          if (result.conflict) {
            onSession(result.session);
            setSaveConflict(result.conflict);
            setSaveConflictError("");
            onStatus("Save paused · choose how to resolve the disk change");
            return false;
          }
          const saved = acceptSavedSession(result.session);
          if (saved && overwrite) await onWorkspaceChange();
          return saved;
        } catch (error) {
          onStatus(`Save failed: ${String(error)}`);
          return false;
        }
      },
      [acceptSavedSession, onSession, onStatus, onWorkspaceChange, readOnly],
    );

    const saveAsCurrent = useCallback(async () => {
      if (readOnly) return false;
      onStatus("Save As…");
      try {
        const session = await client.saveAs(contentRef.current);
        const active = session.notes.find((item) => item.id === session.activeId);
        if (active?.dirty) {
          onStatus("Save As cancelled");
          return false;
        }
        return acceptSavedSession(session);
      } catch (error) {
        onStatus(`Save As failed: ${String(error)}`);
        return false;
      }
    }, [acceptSavedSession, onStatus, readOnly]);

    const resolveSaveConflict = useCallback(
      async (resolution: "copy" | "reload" | "overwrite") => {
        if (!saveConflict || saveConflictBusy) return;
        setSaveConflictBusy(resolution);
        setSaveConflictError("");
        try {
          if (resolution === "copy") {
            const session = await client.saveAs(contentRef.current);
            const active = session.notes.find((item) => item.id === session.activeId);
            if (active?.dirty) {
              onStatus("Save a Copy cancelled · your draft is still open");
              return;
            }
            acceptSavedSession(session, "Saved a copy");
            return;
          }
          if (resolution === "reload") {
            const session = await client.reloadSource(contentRef.current);
            setSaveConflict(undefined);
            await onDocument(session, "Reloaded disk version · Markpad draft kept in history");
            await onWorkspaceChange();
            return;
          }
          const result = await client.save(contentRef.current, true);
          if (result.conflict) {
            setSaveConflict(result.conflict);
            onSession(result.session);
            return;
          }
          if (acceptSavedSession(result.session, "Disk version overwritten")) {
            await onWorkspaceChange();
          }
        } catch (error) {
          setSaveConflictError(error instanceof Error ? error.message : String(error));
          onStatus(`Conflict resolution failed: ${String(error)}`);
        } finally {
          setSaveConflictBusy("");
        }
      },
      [
        acceptSavedSession,
        onDocument,
        onSession,
        onStatus,
        onWorkspaceChange,
        saveConflict,
        saveConflictBusy,
      ],
    );

    useImperativeHandle(
      ref,
      () => ({
        flush,
        save: () => saveCurrent(),
        saveAs: saveAsCurrent,
        async revert() {
          setContent(committed.current);
          contentRef.current = committed.current;
          dirtyRef.current = committedDirty.current;
          onDirty(committedDirty.current);
          if (note)
            onSession(await client.revert(note.id, committed.current, committedDirty.current));
          onStatus("Reverted");
        },
        undo: () => stepHistory(-1),
        redo: () => stepHistory(1),
        format,
        findNext,
        revealMatch,
        goToLine(line: number) {
          const input = editor.current;
          if (!input) return;
          let position = 0;
          const lines = contentRef.current.split("\n");
          for (let index = 0; index < line; index++) position += lines[index].length + 1;
          input.focus();
          input.setSelectionRange(position, position);
          const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 28;
          input.scrollTop = Math.max(0, line * lineHeight - input.clientHeight / 3);
        },
        getContent: () => contentRef.current,
      }),
      [
        findNext,
        flush,
        format,
        note,
        onDirty,
        onSession,
        onStatus,
        revealMatch,
        saveAsCurrent,
        saveCurrent,
        stepHistory,
      ],
    );

    const showEditor = viewMode === "markdown" || viewMode === "split";
    const showViewer = viewMode === "viewer" || viewMode === "split";

    return (
      <>
        <div className="flex-1 flex flex-col overflow-hidden">
          {findOpen && (
            <div
              id="find-bar"
              className="flex items-center gap-2 px-3 py-1.5 border-b border-border-soft bg-hover"
            >
              <input
                ref={findInput}
                value={findQuery}
                onChange={(event) => {
                  setFindQuery(event.target.value);
                  findNext(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") findNext(findQuery);
                  if (event.key === "Escape") onCloseFind();
                }}
                placeholder="Find in editor…"
                className="flex-1 bg-transparent border-none outline-none text-[13px]"
              />
              <span className="text-[11px] text-muted">{findInfo}</span>
              <button className="text-muted hover:text-[#1a1c1b]" onClick={onCloseFind}>
                ×
              </button>
            </div>
          )}
          <div
            ref={area}
            id="content-area"
            role="presentation"
            className="flex-1 flex overflow-hidden"
            onMouseMove={(event) => {
              if (!resizing.current || !area.current) return;
              const rect = area.current.getBoundingClientRect();
              setSplit(
                Math.max(20, Math.min(80, ((event.clientX - rect.left) / rect.width) * 100)),
              );
            }}
            onMouseUp={() => {
              resizing.current = false;
            }}
          >
            {showEditor && (
              <div
                id="editor-container"
                className="flex-1 overflow-hidden p-3"
                style={viewMode === "split" ? { flex: `0 0 ${split}%` } : undefined}
              >
                <textarea
                  ref={editor}
                  id="editor"
                  value={content}
                  readOnly={readOnly}
                  wrap="off"
                  spellCheck={false}
                  className="w-full h-full border-none outline-none resize-none bg-editor text-[#1a1c1b] font-mono leading-7 p-5 rounded-lg select-text"
                  style={{ tabSize: 4, fontSize: textSize }}
                  onScroll={savePosition}
                  onKeyUp={savePosition}
                  onChange={(event) =>
                    changeContent(
                      event.target.value,
                      event.target.selectionStart,
                      event.target.selectionEnd,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Tab") {
                      event.preventDefault();
                      const input = event.currentTarget;
                      const value =
                        contentRef.current.slice(0, input.selectionStart) +
                        "    " +
                        contentRef.current.slice(input.selectionEnd);
                      const cursor = input.selectionStart + 4;
                      changeContent(value, cursor, cursor);
                      requestAnimationFrame(() => input.setSelectionRange(cursor, cursor));
                      return;
                    }
                    if (event.key !== "Enter" || event.ctrlKey || event.shiftKey || event.altKey)
                      return;
                    const input = event.currentTarget;
                    const position = input.selectionStart;
                    const value = contentRef.current;
                    const lineStart = value.lastIndexOf("\n", position - 1) + 1;
                    const line = value.slice(lineStart, position);
                    const empty = /^(\s*)(?:[-*]|\d+\.|- \[[ x]\])\s$/.exec(line);
                    const task = /^(\s*)- \[[ x]\]\s(.+)/.exec(line);
                    const bullet = /^(\s*)([-*])\s(.+)/.exec(line);
                    const numbered = /^(\s*)(\d+)\.\s(.+)/.exec(line);
                    if (!empty && !task && !bullet && !numbered) return;
                    event.preventDefault();
                    let insertion = "\n";
                    if (task) insertion = `\n${task[1]}- [ ] `;
                    else if (bullet) insertion = `\n${bullet[1]}${bullet[2]} `;
                    else if (numbered) insertion = `\n${numbered[1]}${Number(numbered[2]) + 1}. `;
                    const before = empty ? value.slice(0, lineStart) : value.slice(0, position);
                    const next = before + insertion + value.slice(position);
                    const cursor = before.length + insertion.length;
                    changeContent(next, cursor, cursor);
                    requestAnimationFrame(() => input.setSelectionRange(cursor, cursor));
                  }}
                />
              </div>
            )}
            {viewMode === "split" && (
              <button
                type="button"
                id="resize-divider"
                aria-label="Resize editor and preview"
                className="w-1 cursor-col-resize bg-border hover:bg-accent flex-shrink-0"
                onMouseDown={(event) => {
                  resizing.current = true;
                  event.preventDefault();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  setSplit((value) =>
                    Math.max(20, Math.min(80, value + (event.key === "ArrowLeft" ? -5 : 5))),
                  );
                }}
              />
            )}
            {showViewer && (
              <div
                ref={viewer}
                id="viewer-container"
                className="flex-1 overflow-auto overscroll-contain p-3"
                style={viewMode === "split" ? { flex: `0 0 ${100 - split}%` } : undefined}
                onScroll={savePosition}
              >
                <Viewer note={note} content={previewContent} textSize={textSize} />
              </div>
            )}
          </div>
        </div>
        <SaveConflictDialog
          conflict={saveConflict}
          busy={saveConflictBusy}
          error={saveConflictError}
          onCancel={() => {
            if (saveConflictBusy) return;
            setSaveConflict(undefined);
            setSaveConflictError("");
            onStatus("Save cancelled · Markpad draft kept");
          }}
          onSaveCopy={() => void resolveSaveConflict("copy")}
          onReload={() => void resolveSaveConflict("reload")}
          onOverwrite={() => void resolveSaveConflict("overwrite")}
        />
      </>
    );
  },
);
