import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { CommandPalette, type PaletteAction } from "./components/CommandPalette";
import { DeleteDialog, type DeleteTarget } from "./components/DeleteDialog";
import { DocumentWorkspace, type DocumentWorkspaceHandle } from "./components/DocumentWorkspace";
import { FileDraftDialog, type FileDraftTarget } from "./components/FileDraftDialog";
import { HistoryPanel } from "./components/HistoryPanel";
import {
  Bold,
  Clock3,
  Code2,
  Columns2,
  Copy,
  Eye,
  FilePlus2,
  FolderOpen,
  ImageIcon,
  Info,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pencil,
  Quote,
  Redo2,
  Save,
  SquarePen,
  Star,
  Strikethrough,
  Table2,
  Trash2,
  Undo2,
  X,
} from "./components/icons";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceSearch } from "./components/WorkspaceSearch";
import { client } from "./workspace/client";
import {
  availableViews,
  fileType,
  formatBytes,
  isReadOnly,
  openFileDirty,
  viewLabel,
} from "./workspace/documents";
import { suggestWorkspaceDraftPath } from "./workspace/filing";
import { initialWorkspaceState, workspaceReducer } from "./workspace/state";
import type {
  DraftFormat,
  FileInfo,
  NoteInfo,
  OutlineItem,
  SessionState,
  ViewMode,
  WorkspaceFile,
  WorkspaceSearchResult,
  WorkspaceState,
} from "./workspace/types";

const UI_ZOOM_MIN = 0.8;
const UI_ZOOM_MAX = 1.5;
const TEXT_ZOOM_MIN = 10;
const TEXT_ZOOM_MAX = 28;

const EMPTY_WORKSPACE: WorkspaceState = {
  root: "",
  name: "",
  files: [],
  truncated: false,
};

type Modal =
  | { kind: "rename"; note: NoteInfo }
  | { kind: "info"; info: FileInfo; storage: string }
  | { kind: "help" }
  | { kind: "about" }
  | { kind: "preferences"; storage: string }
  | { kind: "changelog" };

interface ContextMenuState {
  note: NoteInfo;
  x: number;
  y: number;
}

function storedNumber(key: string, fallback: number) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function ModalLayer({
  modal,
  onClose,
  onRename,
  onOpenFolder,
}: {
  modal?: Modal;
  onClose(): void;
  onRename(note: NoteInfo, name: string): void;
  onOpenFolder(path: string): void;
}) {
  const [name, setName] = useState(modal?.kind === "rename" ? modal.note.title : "");
  useEffect(() => setName(modal?.kind === "rename" ? modal.note.title : ""), [modal]);
  if (!modal) return null;

  let title = "";
  let body: React.ReactNode;
  if (modal.kind === "rename") {
    title = "Rename file";
    body = (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onRename(modal.note, name);
        }}
      >
        <label htmlFor="rename-input" className="block mb-1.5 text-[11px] font-bold text-muted">
          File name
        </label>
        <input
          id="rename-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full border border-border rounded-lg bg-editor px-3 py-2 text-[13px] outline-none"
        />
        <p className="my-2 text-[11px] text-muted">
          The file stays in the same folder. Changing the extension changes how Markpad opens it.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="confirm-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="confirm-btn primary">Rename</button>
        </div>
      </form>
    );
  } else if (modal.kind === "info") {
    title = "File information";
    const rows = [
      ["Name", modal.info.name],
      ["Type", modal.info.label],
      ["Size", formatBytes(modal.info.size)],
      ["Modified", modal.info.modified || "Unknown"],
      ["Path", modal.info.path || "Not saved"],
      ["Storage", modal.storage],
    ];
    body = (
      <>
        <table className="w-full border-collapse">
          {rows.map(([label, value]) => (
            <tbody key={label}>
              <tr>
                <td className="p-1.5 text-muted align-top">{label}</td>
                <td className="p-1.5 break-all">{value}</td>
              </tr>
            </tbody>
          ))}
        </table>
        {modal.info.path && (
          <div className="mt-3 text-center">
            <button className="confirm-btn primary" onClick={() => onOpenFolder(modal.info.path)}>
              Open Folder
            </button>
          </div>
        )}
      </>
    );
  } else if (modal.kind === "help") {
    title = "Help";
    body = (
      <div className="space-y-2">
        <p>
          <strong>Markpad</strong> is a native Markdown notepad.
        </p>
        <p>Open Markdown, text, code, config, logs, PDFs, images, ebooks, and office documents.</p>
        <p>
          Star notes to pin them. Drag open files to reorder them. Lists auto-continue on Enter.
        </p>
        <h3 className="font-bold pt-2">Shortcuts</h3>
        <p>
          <kbd>Ctrl+P</kbd> Files and commands · <kbd>Ctrl+N</kbd> New · <kbd>Ctrl+O</kbd> Open
        </p>
        <p>
          <kbd>Ctrl+F</kbd> Find in file · <kbd>Ctrl+Shift+F</kbd> Find in folder ·{" "}
          <kbd>Ctrl+Shift+O</kbd> Open folder
        </p>
        <p>
          <kbd>Ctrl+Shift+Enter</kbd> File an unsaved draft in the workspace
        </p>
        <p>
          <kbd>Ctrl+1/2/3</kbd> Editor / Split / Preview · <kbd>Ctrl+0</kbd> Reset zoom
        </p>
      </div>
    );
  } else if (modal.kind === "preferences") {
    title = "Preferences";
    body = (
      <div className="space-y-2">
        <p>Markpad keeps settings intentionally small and automatic.</p>
        <p>
          <strong>Storage</strong>
          <br />
          <span className="text-muted break-all">{modal.storage}</span>
        </p>
        <p>
          <strong>File handling</strong>
          <br />
          <span className="text-muted">
            Markdown: Editor, Split, Preview. Code and text: Editor, Viewer. Binary documents:
            external handoff.
          </span>
        </p>
      </div>
    );
  } else if (modal.kind === "changelog") {
    title = "Changelog";
    body = (
      <div className="space-y-3">
        <section>
          <h3 className="font-bold">0.10.0</h3>
          <p>
            Typed React workspace, Workspace Lite folder browsing, fast file and whole-folder
            search, exact match selection, external-change save protection, quick draft filing, and
            confirmed on-disk deletion.
          </p>
        </section>
        <section>
          <h3 className="font-bold">Eklavya</h3>
          <p>
            Scroll-position memory, expanded syntax highlighting, version history, and performance
            improvements.
          </p>
        </section>
        <section>
          <h3 className="font-bold">Dhruva</h3>
          <p>Single instance, image preview, file information, and rich context actions.</p>
        </section>
      </div>
    );
  } else {
    title = "About Markpad";
    body = (
      <div className="space-y-2">
        <p>
          <strong>Markpad</strong>
        </p>
        <p className="text-muted">Version 0.10.0</p>
        <p>A tiny local notepad built with Go, Wails, React, and the operating system webview.</p>
        <p>No Electron, cloud, telemetry, or runtime network dependency.</p>
        <p>
          <a
            href="https://github.com/shreyam1008/markpad"
            className="text-accent underline"
            onClick={(event) => {
              event.preventDefault();
              void client.openURL(event.currentTarget.href);
            }}
          >
            GitHub
          </a>{" "}
          · MIT License · by Shreyam Adhikari
        </p>
      </div>
    );
  }
  return (
    <div
      role="presentation"
      className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-xl overflow-hidden mx-6">
        <div className="flex justify-between items-center px-5 pt-4 pb-3 border-b border-border-soft">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            aria-label="Close dialog"
            className="text-muted hover:text-[#1a1c1b]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-[13px] leading-6 text-[#3d403e] max-h-[55vh] overflow-y-auto">
          {body}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const [startupError, setStartupError] = useState("");
  const [activeDirty, setActiveDirty] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [stats, setStats] = useState("");
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [folderWorkspace, setFolderWorkspace] = useState<WorkspaceState>(EMPTY_WORKSPACE);
  const [modal, setModal] = useState<Modal>();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [closeCandidate, setCloseCandidate] = useState<NoteInfo>();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>();
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [fileDraftTarget, setFileDraftTarget] = useState<FileDraftTarget>();
  const [fileDraftBusy, setFileDraftBusy] = useState(false);
  const [fileDraftError, setFileDraftError] = useState("");
  const [uiZoom, setUiZoom] = useState(() =>
    Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, storedNumber("markpad-ui-zoom", 1))),
  );
  const [textSize, setTextSize] = useState(() =>
    Math.min(TEXT_ZOOM_MAX, Math.max(TEXT_ZOOM_MIN, storedNumber("markpad-text-zoom", 14))),
  );
  const workspace = useRef<DocumentWorkspaceHandle>(null);
  const pendingReveal = useRef<WorkspaceSearchResult | undefined>(undefined);
  const actionsRef = useRef<Record<string, () => void | Promise<void>>>({});
  const sessionRef = useRef(state.session);
  sessionRef.current = state.session;

  const active = state.session.notes.find((note) => note.id === state.session.activeId);
  const activeType = fileType(active?.path, active?.kind);
  const modes = availableViews(activeType);
  const readOnly = isReadOnly(activeType);
  const canFileDraft =
    !!folderWorkspace.root &&
    !!active &&
    !active.path &&
    (activeType === "md" || activeType === "text");

  const displaySession = useMemo<SessionState>(
    () => ({
      ...state.session,
      notes: state.session.notes.map((note) =>
        note.id === state.session.activeId ? { ...note, dirty: activeDirty } : note,
      ),
    }),
    [activeDirty, state.session],
  );

  const setStatus = useCallback((status: string) => dispatch({ type: "status", status }), []);
  const updateHistoryAvailability = useCallback((undo: boolean, redo: boolean) => {
    setUndoAvailable(undo);
    setRedoAvailable(redo);
  }, []);
  const acceptSession = useCallback((session: SessionState) => {
    dispatch({ type: "session", session });
    setActiveDirty(session.notes.find((note) => note.id === session.activeId)?.dirty ?? false);
  }, []);

  const loadDocument = useCallback(
    async (session: SessionState, status?: string) => {
      const content = await client.activeContent();
      dispatch({ type: "document", session, content });
      setActiveDirty(session.notes.find((note) => note.id === session.activeId)?.dirty ?? false);
      setFindOpen(false);
      if (status) setStatus(status);
    },
    [setStatus],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const boot = async () => {
      try {
        const [session, content, folder] = await Promise.all([
          client.session(),
          client.activeContent(),
          client.workspace(),
        ]);
        if (!cancelled) {
          dispatch({ type: "loaded", session, content });
          setFolderWorkspace(folder);
          setActiveDirty(
            session.notes.find((note) => note.id === session.activeId)?.dirty ?? false,
          );
        }
      } catch (error) {
        if (!window.go?.main?.App) timer = setTimeout(boot, 80);
        else if (!cancelled)
          setStartupError(error instanceof Error ? error.message : String(error));
      }
    };
    void boot();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const match = pendingReveal.current;
    if (!match || (state.viewMode !== "markdown" && state.viewMode !== "split")) return;
    const frame = requestAnimationFrame(() => {
      const handle = workspace.current;
      if (!handle) return;
      handle.revealMatch(match.line, match.column, match.matchEnd - match.matchStart);
      pendingReveal.current = undefined;
    });
    return () => cancelAnimationFrame(frame);
  }, [state.contentVersion, state.viewMode]);

  const activate = useCallback(
    async (id: string) => {
      if (id === state.session.activeId) return;
      await workspace.current?.flush();
      await client.activate(id);
      await loadDocument(await client.session());
    },
    [loadDocument, state.session.activeId],
  );

  const create = useCallback(
    async (format: DraftFormat = "md") => {
      await workspace.current?.flush();
      await loadDocument(await client.create(format), `New ${format.toUpperCase()} file`);
    },
    [loadDocument],
  );

  const open = useCallback(async () => {
    await workspace.current?.flush();
    try {
      await loadDocument(await client.open(), "File opened");
    } catch (error) {
      setStatus(`Open failed: ${String(error)}`);
    }
  }, [loadDocument, setStatus]);

  const openPath = useCallback(
    async (path: string) => {
      await workspace.current?.flush();
      try {
        await loadDocument(await client.openPath(path), "File opened");
      } catch (error) {
        setStatus(`Open failed: ${String(error)}`);
      }
    },
    [loadDocument, setStatus],
  );

  const syncFolderWorkspace = useCallback(async () => {
    setFolderWorkspace(await client.workspace());
  }, []);

  const chooseWorkspace = useCallback(async () => {
    await workspace.current?.flush();
    try {
      const next = await client.chooseWorkspace();
      setFolderWorkspace(next);
      setStatus(
        next.root === folderWorkspace.root
          ? next.root
            ? "Folder unchanged"
            : "Folder selection cancelled"
          : next.root
            ? `Folder opened: ${next.name}`
            : "Folder selection cancelled",
      );
    } catch (error) {
      setStatus(`Open folder failed: ${String(error)}`);
    }
  }, [folderWorkspace.root, setStatus]);

  const refreshFolderWorkspace = useCallback(async () => {
    if (!folderWorkspace.root) return;
    setStatus("Refreshing folder…");
    try {
      const next = await client.refreshWorkspace();
      setFolderWorkspace(next);
      setStatus(`Folder refreshed · ${next.files.length}${next.truncated ? "+" : ""} files`);
    } catch (error) {
      setStatus(`Refresh failed: ${String(error)}`);
    }
  }, [folderWorkspace.root, setStatus]);

  const clearFolderWorkspace = useCallback(async () => {
    try {
      setFolderWorkspace(await client.clearWorkspace());
      setWorkspaceSearchOpen(false);
      setStatus("Folder closed");
    } catch (error) {
      setStatus(`Close folder failed: ${String(error)}`);
    }
  }, [setStatus]);

  const showWorkspaceSearch = useCallback(async () => {
    await workspace.current?.flush();
    setFindOpen(false);
    setPaletteOpen(false);
    setWorkspaceSearchOpen(true);
  }, []);

  const createWorkspaceFile = useCallback(
    async (relativePath: string) => {
      await workspace.current?.flush();
      try {
        const session = await client.createWorkspaceFile(relativePath);
        await loadDocument(session, `Created ${relativePath}`);
        await syncFolderWorkspace();
      } catch (error) {
        setStatus(`Create failed: ${String(error)}`);
      }
    },
    [loadDocument, setStatus, syncFolderWorkspace],
  );

  const showFileDraft = useCallback(() => {
    if (!folderWorkspace.root) {
      setStatus("Open a workspace folder before filing a draft");
      return;
    }
    if (!active || active.path || (activeType !== "md" && activeType !== "text")) {
      setStatus("Only an unsaved Markdown or text draft can be filed in the workspace");
      return;
    }
    const content = workspace.current?.getContent() ?? state.content;
    setFileDraftError("");
    setFileDraftTarget({
      suggestion: suggestWorkspaceDraftPath(
        content,
        activeType === "text" ? "txt" : "md",
        folderWorkspace.files.map((file) => file.relative),
      ),
      workspaceName: folderWorkspace.name,
      workspaceRoot: folderWorkspace.root,
    });
  }, [active, activeType, folderWorkspace, setStatus, state.content]);

  const fileDraftInWorkspace = useCallback(
    async (relativePath: string) => {
      if (fileDraftBusy) return;
      setFileDraftBusy(true);
      setFileDraftError("");
      try {
        await workspace.current?.flush();
        const content = workspace.current?.getContent() ?? state.content;
        const session = await client.fileDraftInWorkspace(relativePath, content);
        await loadDocument(session, `Filed in ${folderWorkspace.name}: ${relativePath}`);
        await syncFolderWorkspace();
        setFileDraftTarget(undefined);
      } catch (error) {
        setFileDraftError(error instanceof Error ? error.message : String(error));
      } finally {
        setFileDraftBusy(false);
      }
    },
    [fileDraftBusy, folderWorkspace.name, loadDocument, state.content, syncFolderWorkspace],
  );

  const openWorkspaceSearchResult = useCallback(
    async (result: WorkspaceSearchResult) => {
      await workspace.current?.flush();
      try {
        pendingReveal.current = result;
        const session = await client.openPath(result.path);
        await loadDocument(session, `${result.relative} · line ${result.line}`);
        dispatch({ type: "view", mode: "markdown" });
        const activeID = session.activeId;
        if (activeID) await client.setView(activeID, "markdown");
        setWorkspaceSearchOpen(false);
      } catch (error) {
        pendingReveal.current = undefined;
        setStatus(`Open match failed: ${String(error)}`);
      }
    },
    [loadDocument, setStatus],
  );

  const chooseView = useCallback(
    (mode: ViewMode) => {
      if (!active || !availableViews(fileType(active.path, active.kind)).includes(mode)) return;
      dispatch({ type: "view", mode });
      void client.setView(active.id, mode);
    },
    [active],
  );

  const cycleDocument = useCallback(
    (direction: number) => {
      const notes = state.session.notes;
      if (notes.length < 2) return;
      const index = notes.findIndex((note) => note.id === state.session.activeId);
      void activate(notes[(index + direction + notes.length) % notes.length].id);
    },
    [activate, state.session],
  );

  const requestClose = useCallback(
    (note?: NoteInfo) => {
      if (!note) return;
      if (note.dirty || (note.id === state.session.activeId && activeDirty)) {
        if (note.id !== state.session.activeId) {
          void activate(note.id).then(() => setCloseCandidate(note));
        } else setCloseCandidate(note);
      } else
        void (async () => {
          const session = await client.close(note.id);
          if (session.activeId !== state.session.activeId) await loadDocument(session);
          else acceptSession(session);
        })();
    },
    [acceptSession, activate, activeDirty, loadDocument, state.session.activeId],
  );

  const requestDeleteNote = useCallback(
    (note: NoteInfo) => {
      setDeleteError("");
      setDeleteTarget({
        kind: note.path ? "file" : "draft",
        name: note.path ? note.title : "Untitled draft",
        path: note.path,
        dirty: note.id === state.session.activeId ? activeDirty : note.dirty,
        noteId: note.id,
      });
    },
    [activeDirty, state.session.activeId],
  );

  const requestDeleteWorkspaceFile = useCallback(
    (file: WorkspaceFile) => {
      const openState = openFileDirty(
        file.path,
        state.session.notes,
        state.session.activeId,
        activeDirty,
      );
      setDeleteError("");
      setDeleteTarget({
        kind: "file",
        name: file.name,
        path: file.path,
        dirty: openState.dirty,
        noteId: openState.noteId,
      });
    },
    [activeDirty, state.session.activeId, state.session.notes],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await workspace.current?.flush();
      const session =
        deleteTarget.kind === "file"
          ? await client.deleteFile(deleteTarget.path)
          : await client.deleteDraft(deleteTarget.noteId ?? "");
      await loadDocument(session, `${deleteTarget.name} deleted`);
      await syncFolderWorkspace();
      setDeleteTarget(undefined);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, deleteTarget, loadDocument, syncFolderWorkspace]);

  const rename = useCallback(
    async (note: NoteInfo, name: string) => {
      try {
        acceptSession(await client.rename(note.id, name));
        setModal(undefined);
        setStatus(`Renamed to ${name}`);
        await syncFolderWorkspace();
      } catch (error) {
        setStatus(`Rename failed: ${String(error)}`);
      }
    },
    [acceptSession, setStatus, syncFolderWorkspace],
  );

  const showInfo = useCallback(
    async (note = active) => {
      if (!note) return;
      const [info, storage] = await Promise.all([client.fileInfo(note.id), client.storagePath()]);
      setModal({ kind: "info", info, storage });
    },
    [active],
  );

  const adjustUiZoom = useCallback(
    (direction: number) => {
      setUiZoom((current) => {
        const next =
          direction === 0
            ? 1
            : Math.min(
                UI_ZOOM_MAX,
                Math.max(UI_ZOOM_MIN, Number((current + direction * 0.1).toFixed(1))),
              );
        localStorage.setItem("markpad-ui-zoom", String(next));
        setStatus(`Interface zoom: ${Math.round(next * 100)}%`);
        return next;
      });
    },
    [setStatus],
  );

  const adjustTextZoom = useCallback(
    (direction: number) => {
      setTextSize((current) => {
        const next = Math.min(TEXT_ZOOM_MAX, Math.max(TEXT_ZOOM_MIN, current + direction));
        localStorage.setItem("markpad-text-zoom", String(next));
        setStatus(`Text zoom: ${Math.round((next / 14) * 100)}%`);
        return next;
      });
    },
    [setStatus],
  );

  const restoreHistory = useCallback(
    async (timestamp: string) => {
      if (!active) return;
      const session = await client.restore(active.id, timestamp);
      await loadDocument(session, "Version restored");
    },
    [active, loadDocument],
  );

  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      {
        id: "file.new-markdown",
        title: "New Markdown file",
        category: "File",
        shortcut: "Ctrl+N",
        keywords: ["md", "note"],
        run: () => create("md"),
      },
      { id: "file.new-text", title: "New text file", category: "File", run: () => create("txt") },
      { id: "file.new-json", title: "New JSON file", category: "File", run: () => create("json") },
      { id: "file.new-yaml", title: "New YAML file", category: "File", run: () => create("yaml") },
      { id: "file.open", title: "Open file", category: "File", shortcut: "Ctrl+O", run: open },
      {
        id: "file.open-folder",
        title: folderWorkspace.root ? "Change workspace folder" : "Open workspace folder",
        category: "File",
        shortcut: "Ctrl+Shift+O",
        keywords: ["choose", "directory", "vault"],
        run: chooseWorkspace,
      },
      {
        id: "file.refresh-folder",
        title: "Refresh workspace folder",
        category: "File",
        shortcut: "F5",
        enabled: !!folderWorkspace.root,
        run: refreshFolderWorkspace,
      },
      {
        id: "file.close-folder",
        title: "Close workspace folder",
        category: "File",
        enabled: !!folderWorkspace.root,
        run: clearFolderWorkspace,
      },
      {
        id: "file.save",
        title: "Save",
        category: "File",
        shortcut: "Ctrl+S",
        enabled: !readOnly,
        run: () => workspace.current?.save(),
      },
      {
        id: "file.save-as",
        title: "Save as",
        category: "File",
        shortcut: "Ctrl+Shift+S",
        enabled: !readOnly,
        run: () => workspace.current?.saveAs(),
      },
      {
        id: "file.file-draft",
        title: `File draft in ${folderWorkspace.name || "workspace"}`,
        category: "File",
        shortcut: "Ctrl+Shift+Enter",
        keywords: ["promote", "organize", "folder", "note"],
        enabled: canFileDraft,
        run: showFileDraft,
      },
      {
        id: "file.rename",
        title: "Rename file",
        category: "File",
        shortcut: "F2",
        enabled: !!active?.path,
        run: () => active && setModal({ kind: "rename", note: active }),
      },
      {
        id: "file.close",
        title: "Close current file",
        category: "File",
        shortcut: "Ctrl+W",
        enabled: !!active,
        run: () => requestClose(active),
      },
      {
        id: "file.delete",
        title: active?.path ? "Delete current file" : "Delete current draft",
        category: "File",
        enabled: !!active,
        keywords: ["remove", "permanent"],
        run: () => active && requestDeleteNote(active),
      },
      {
        id: "view.editor",
        title: "Show editor",
        category: "View",
        shortcut: "Ctrl+1",
        enabled: modes.includes("markdown"),
        run: () => chooseView("markdown"),
      },
      {
        id: "view.split",
        title: "Show split view",
        category: "View",
        shortcut: "Ctrl+2",
        enabled: modes.includes("split"),
        run: () => chooseView("split"),
      },
      {
        id: "view.preview",
        title: "Show preview",
        category: "View",
        shortcut: "Ctrl+3",
        enabled: modes.includes("viewer"),
        run: () => chooseView("viewer"),
      },
      {
        id: "view.sidebar",
        title: "Toggle sidebar",
        category: "View",
        shortcut: "Ctrl+Shift+B",
        run: () => setSidebarCollapsed((value) => !value),
      },
      {
        id: "view.history",
        title: "Toggle version history",
        category: "View",
        shortcut: "Ctrl+H",
        run: () => setHistoryOpen((value) => !value),
      },
      {
        id: "edit.find",
        title: "Find in file",
        category: "Edit",
        shortcut: "Ctrl+F",
        enabled: !readOnly,
        run: () => setFindOpen(true),
      },
      {
        id: "edit.find-folder",
        title: "Find in workspace folder",
        category: "Edit",
        shortcut: "Ctrl+Shift+F",
        keywords: ["search", "grep", "all files", "content"],
        run: showWorkspaceSearch,
      },
      {
        id: "edit.undo",
        title: "Undo",
        category: "Edit",
        shortcut: "Ctrl+Z",
        enabled: undoAvailable,
        run: () => workspace.current?.undo(),
      },
      {
        id: "edit.redo",
        title: "Redo",
        category: "Edit",
        shortcut: "Ctrl+Shift+Z",
        enabled: redoAvailable,
        run: () => workspace.current?.redo(),
      },
      {
        id: "view.zoom-in",
        title: "Zoom interface in",
        category: "View",
        shortcut: "Ctrl++",
        run: () => adjustUiZoom(1),
      },
      {
        id: "view.zoom-out",
        title: "Zoom interface out",
        category: "View",
        shortcut: "Ctrl+-",
        run: () => adjustUiZoom(-1),
      },
      {
        id: "view.zoom-reset",
        title: "Reset interface zoom",
        category: "View",
        shortcut: "Ctrl+0",
        run: () => adjustUiZoom(0),
      },
    ],
    [
      active,
      adjustUiZoom,
      canFileDraft,
      chooseWorkspace,
      chooseView,
      clearFolderWorkspace,
      create,
      folderWorkspace.name,
      folderWorkspace.root,
      modes,
      open,
      readOnly,
      redoAvailable,
      refreshFolderWorkspace,
      requestClose,
      requestDeleteNote,
      showFileDraft,
      showWorkspaceSearch,
      undoAvailable,
    ],
  );

  actionsRef.current = {
    new: () => create("md"),
    open,
    openfolder: chooseWorkspace,
    searchworkspace: showWorkspaceSearch,
    refreshworkspace: refreshFolderWorkspace,
    save: async () => {
      await workspace.current?.save();
    },
    saveas: async () => {
      await workspace.current?.saveAs();
    },
    filedraft: showFileDraft,
    close: () => requestClose(active),
    undo: () => workspace.current?.undo(),
    redo: () => workspace.current?.redo(),
    nextfile: () => cycleDocument(1),
    previousfile: () => cycleDocument(-1),
    vieweditor: () => chooseView("markdown"),
    viewsplit: () => chooseView("split"),
    viewpreview: () => chooseView("viewer"),
    toggleview: () => chooseView(modes[(modes.indexOf(state.viewMode) + 1) % modes.length]),
    togglesidebar: () => setSidebarCollapsed((value) => !value),
    find: () => setFindOpen(true),
    history: () => setHistoryOpen((value) => !value),
    zoomin: () => adjustUiZoom(1),
    zoomout: () => adjustUiZoom(-1),
    zoomreset: () => adjustUiZoom(0),
    rename: () => {
      if (active?.path) setModal({ kind: "rename", note: active });
    },
    fileinfo: () => showInfo(),
    help: () => setModal({ kind: "help" }),
    about: () => setModal({ kind: "about" }),
    preferences: async () => setModal({ kind: "preferences", storage: await client.storagePath() }),
    changelog: () => setModal({ kind: "changelog" }),
  };

  useEffect(() => {
    const runtime = window.runtime;
    if (!runtime) return;
    const names = [
      "new",
      "open",
      "openfolder",
      "save",
      "saveas",
      "filedraft",
      "close",
      "undo",
      "redo",
      "toggleview",
      "nextfile",
      "previousfile",
      "vieweditor",
      "viewsplit",
      "viewpreview",
      "togglesidebar",
      "find",
      "searchworkspace",
      "refreshworkspace",
      "history",
      "zoomin",
      "zoomout",
      "zoomreset",
      "preferences",
      "fileinfo",
      "changelog",
      "help",
      "about",
    ];
    const cancel = names.map((name) =>
      runtime.EventsOn(`menu:${name}`, () => void actionsRef.current[name]?.()),
    );
    cancel.push(
      runtime.EventsOn("secondInstance", async () => {
        await workspace.current?.flush();
        await loadDocument(await client.session(), "File opened from second instance");
        await syncFolderWorkspace();
      }),
    );
    runtime.OnFileDrop((_x, _y, paths) => {
      void (async () => {
        await workspace.current?.flush();
        let session = sessionRef.current;
        for (const path of paths) session = await client.openDropped(path);
        await loadDocument(
          session,
          paths.length === 1 ? "File opened" : `Opened ${paths.length} files`,
        );
        await syncFolderWorkspace();
      })();
    }, true);
    return () => cancel.forEach((off) => off?.());
  }, [loadDocument, syncFolderWorkspace]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      document.body.classList.toggle("shortcuts-visible", ctrl);
      if (ctrl && key === "p") {
        event.preventDefault();
        setWorkspaceSearchOpen(false);
        setPaletteOpen(true);
        return;
      }
      if (ctrl && event.shiftKey && key === "f") {
        event.preventDefault();
        void actionsRef.current.searchworkspace?.();
        return;
      }
      if (ctrl && event.shiftKey && key === "o") {
        event.preventDefault();
        void actionsRef.current.openfolder?.();
        return;
      }
      if (ctrl && event.shiftKey && key === "enter") {
        event.preventDefault();
        void actionsRef.current.filedraft?.();
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        void actionsRef.current.refreshworkspace?.();
        return;
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setWorkspaceSearchOpen(false);
        setModal(undefined);
        setContextMenu(undefined);
        setCloseCandidate(undefined);
        if (!deleteBusy) {
          setDeleteTarget(undefined);
          setDeleteError("");
        }
        if (!fileDraftBusy) {
          setFileDraftTarget(undefined);
          setFileDraftError("");
        }
        setFindOpen(false);
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        void actionsRef.current.rename?.();
        return;
      }
      if (!ctrl) return;
      const map: Record<string, string> = {
        n: "new",
        o: "open",
        s: event.shiftKey ? "saveas" : "save",
        w: "close",
        f: "find",
        h: "history",
        z: event.shiftKey ? "redo" : "undo",
      };
      if (key === "tab") {
        event.preventDefault();
        void actionsRef.current[event.shiftKey ? "previousfile" : "nextfile"]?.();
        return;
      }
      if (key === "1" || key === "2" || key === "3") {
        event.preventDefault();
        void actionsRef.current[["vieweditor", "viewsplit", "viewpreview"][Number(key) - 1]]?.();
        return;
      }
      if (event.shiftKey && key === "b") {
        event.preventDefault();
        void actionsRef.current.togglesidebar?.();
        return;
      }
      if (event.shiftKey && key === "e") {
        event.preventDefault();
        void actionsRef.current.toggleview?.();
        return;
      }
      if (key === "delete" && active) {
        event.preventDefault();
        requestDeleteNote(active);
        return;
      }
      if (key === "=" || key === "+" || event.code === "NumpadAdd") {
        event.preventDefault();
        void actionsRef.current.zoomin?.();
        return;
      }
      if (key === "-" || event.code === "NumpadSubtract") {
        event.preventDefault();
        void actionsRef.current.zoomout?.();
        return;
      }
      if (key === "0" || event.code === "Numpad0") {
        event.preventDefault();
        void actionsRef.current.zoomreset?.();
        return;
      }
      if (key === "b" || key === "i" || key === "k") {
        event.preventDefault();
        workspace.current?.format(key === "b" ? "bold" : key === "i" ? "italic" : "link");
        return;
      }
      if (map[key]) {
        event.preventDefault();
        void actionsRef.current[map[key]]?.();
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Meta") {
        document.body.classList.remove("shortcuts-visible");
      }
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    const blur = () => document.body.classList.remove("shortcuts-visible");
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur);
    };
  }, [active, deleteBusy, fileDraftBusy, requestDeleteNote]);

  useEffect(() => {
    const close = () => setContextMenu(undefined);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  if (startupError) {
    return (
      <main className="flex h-full items-center justify-center bg-[#f4f2ed] p-8 text-[#1a1c1b]">
        <section className="max-w-xl rounded-2xl border border-[#d8d6ce] bg-[#fafaf7] p-6 shadow-xl">
          <h1 className="text-base font-bold">Markpad could not finish starting</h1>
          <p className="mt-3 text-sm leading-6 text-[#6b6e68]">{startupError}</p>
        </section>
      </main>
    );
  }

  const toolbar = [
    ["bold", Bold, "Bold"],
    ["italic", Italic, "Italic"],
    ["strikethrough", Strikethrough, "Strikethrough"],
    ["h1", null, "H1"],
    ["h2", null, "H2"],
    ["h3", null, "H3"],
    ["code", Code2, "Inline code"],
    ["codeblock", null, "```"],
    ["link", Link, "Link"],
    ["image", ImageIcon, "Image"],
    ["ul", List, "Bullet list"],
    ["ol", ListOrdered, "Numbered list"],
    ["task", ListTodo, "Task list"],
    ["table", Table2, "Table"],
    ["hr", Minus, "Horizontal rule"],
    ["quote", Quote, "Blockquote"],
  ] as const;

  return (
    <div id="app" className="flex h-full w-full" style={{ zoom: uiZoom }}>
      <Sidebar
        session={displaySession}
        workspace={folderWorkspace}
        collapsed={sidebarCollapsed}
        outline={outline}
        onCollapse={() => setSidebarCollapsed((value) => !value)}
        onNew={(format) => void create(format)}
        onActivate={(id) => void activate(id)}
        onOpenPath={(path) => void openPath(path)}
        onToggleStar={(id) => void client.toggleStar(id).then(acceptSession)}
        onClose={requestClose}
        onRemoveRecent={(path) => void client.removeRecent(path).then(acceptSession)}
        onReorder={(ids) => void client.reorder(ids).then(acceptSession)}
        onContext={(note, x, y) => setContextMenu({ note, x, y })}
        onOutline={(line) => workspace.current?.goToLine(line)}
        onChooseWorkspace={() => void chooseWorkspace()}
        onRefreshWorkspace={() => void refreshFolderWorkspace()}
        onClearWorkspace={() => void clearFolderWorkspace()}
        onSearchWorkspace={() => void showWorkspaceSearch()}
        onCreateWorkspaceFile={(relativePath) => void createWorkspaceFile(relativePath)}
        onDeleteWorkspaceFile={requestDeleteWorkspaceFile}
      />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-surface">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-soft gap-3 min-h-[44px]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm truncate max-w-[220px]">
              {active?.path ? active.title : "Untitled"}
            </span>
            <button
              className="w-6 h-6 rounded-full border border-border text-muted hover:text-accent hover:border-accent flex-shrink-0 flex items-center justify-center"
              title="File info"
              onClick={() => void showInfo()}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            {activeDirty && (
              <span className="text-[13px] font-bold text-unsaved whitespace-nowrap">
                NOT SAVED
              </span>
            )}
          </div>
          <div className="flex gap-0.5 bg-hover rounded-lg p-0.5 flex-shrink-0">
            {modes.map((mode) => {
              const Icon = mode === "markdown" ? SquarePen : mode === "split" ? Columns2 : Eye;
              return (
                <button
                  key={mode}
                  className={`view-btn ${state.viewMode === mode ? "active" : ""}`}
                  onClick={() => chooseView(mode)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{viewLabel(activeType, mode)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              className="icon-btn"
              disabled={!undoAvailable}
              title="Undo"
              onClick={() => workspace.current?.undo()}
            >
              <Undo2 />
            </button>
            <button
              className="icon-btn"
              disabled={!redoAvailable}
              title="Redo"
              onClick={() => workspace.current?.redo()}
            >
              <Redo2 />
            </button>
            {canFileDraft ? (
              <button
                className="file-draft-quick"
                title="File this draft in the workspace (Ctrl+Shift+Enter)"
                onClick={showFileDraft}
              >
                <FilePlus2 />
                <span>File in folder</span>
              </button>
            ) : null}
            {!readOnly && (
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-hover text-muted hover:bg-border"
                onClick={() => void workspace.current?.revert()}
              >
                Cancel
              </button>
            )}
            {!readOnly && (
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-accent-text hover:bg-accent-hover"
                onClick={() => void workspace.current?.save()}
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            )}
            <button
              className="px-2 py-1.5 rounded-lg bg-hover text-muted hover:bg-border"
              title="Version history"
              onClick={() => setHistoryOpen((value) => !value)}
            >
              <Clock3 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {activeType === "md" && (state.viewMode === "markdown" || state.viewMode === "split") && (
          <div className="flex items-center gap-0.5 px-3 py-1 border-b border-border-soft bg-surface overflow-x-auto">
            {toolbar.map(([action, Icon, title], index) => (
              <span className="contents" key={action}>
                {[3, 6, 8, 11, 14].includes(index) && <span className="tb-sep" />}
                <button
                  className={`tb ${Icon ? "" : "txt"}`}
                  title={title}
                  onClick={() => workspace.current?.format(action)}
                >
                  {Icon ? <Icon /> : title}
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          <DocumentWorkspace
            key={`${active?.id ?? "empty"}-${state.contentVersion}`}
            ref={workspace}
            note={active ? { ...active, dirty: activeDirty } : undefined}
            initialContent={state.content}
            viewMode={state.viewMode}
            textSize={textSize}
            findOpen={findOpen}
            onCloseFind={() => setFindOpen(false)}
            onSession={acceptSession}
            onDocument={loadDocument}
            onWorkspaceChange={syncFolderWorkspace}
            onDirty={setActiveDirty}
            onStatus={setStatus}
            onStats={setStats}
            onOutline={setOutline}
            onHistoryAvailability={updateHistoryAvailability}
            onTextZoom={adjustTextZoom}
          />
          <HistoryPanel
            open={historyOpen}
            note={active}
            currentContent={() => workspace.current?.getContent() ?? state.content}
            onClose={() => setHistoryOpen(false)}
            onRestore={restoreHistory}
            onStatus={setStatus}
          />
        </div>
        <div className="flex justify-between items-center px-4 py-1 text-[11px] text-muted border-t border-border-soft min-h-[26px]">
          <span>{state.status}</span>
          {folderWorkspace.root ? (
            <span className="status-workspace" title={folderWorkspace.root}>
              {folderWorkspace.name} · {folderWorkspace.files.length}
              {folderWorkspace.truncated ? "+" : ""} files
            </span>
          ) : null}
          <span>{stats}</span>
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        notes={state.session.notes}
        activeId={state.session.activeId}
        actions={paletteActions}
        workspaceFiles={folderWorkspace.files}
        onClose={() => setPaletteOpen(false)}
        onActivate={(id) => void activate(id)}
        onOpenPath={(path) => void openPath(path)}
      />
      <WorkspaceSearch
        open={workspaceSearchOpen}
        workspace={folderWorkspace}
        onClose={() => setWorkspaceSearchOpen(false)}
        onChooseWorkspace={() => void chooseWorkspace()}
        onOpen={(result) => openWorkspaceSearchResult(result)}
      />
      <ModalLayer
        modal={modal}
        onClose={() => setModal(undefined)}
        onRename={(note, name) => void rename(note, name)}
        onOpenFolder={(path) => void client.openFolder(path)}
      />

      {contextMenu && (
        <div
          role="menu"
          tabIndex={-1}
          className="fixed z-50 bg-surface border border-border rounded-xl shadow-lg py-1 min-w-[180px] text-[13px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {contextMenu.note.path && (
            <button
              className="ctx-item flex items-center gap-2"
              onClick={() => {
                void client.toggleStar(contextMenu.note.id).then(acceptSession);
                setContextMenu(undefined);
              }}
            >
              <Star className="h-3.5 w-3.5 text-accent" />
              {contextMenu.note.star ? "Unstar" : "Star"}
            </button>
          )}
          <button
            className="ctx-item flex items-center gap-2"
            onClick={() => {
              void showInfo(contextMenu.note);
              setContextMenu(undefined);
            }}
          >
            <Info className="h-3.5 w-3.5" />
            File Info
          </button>
          {contextMenu.note.path && (
            <>
              <button
                className="ctx-item flex items-center gap-2"
                onClick={() => {
                  void client.openFolder(contextMenu.note.path);
                  setContextMenu(undefined);
                }}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Open Folder
              </button>
              <button
                className="ctx-item flex items-center gap-2"
                onClick={() => {
                  void navigator.clipboard.writeText(contextMenu.note.path);
                  setContextMenu(undefined);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Path
              </button>
              <button
                className="ctx-item flex items-center gap-2"
                onClick={() => {
                  setModal({ kind: "rename", note: contextMenu.note });
                  setContextMenu(undefined);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </button>
            </>
          )}
          <div className="mx-2 my-0.5 border-t border-border-soft" />
          <button
            className="ctx-item flex items-center gap-2"
            onClick={() => {
              requestClose(contextMenu.note);
              setContextMenu(undefined);
            }}
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
          <button
            className="ctx-item text-danger flex items-center gap-2"
            onClick={() => {
              requestDeleteNote(contextMenu.note);
              setContextMenu(undefined);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete{contextMenu.note.path ? " File" : " Draft"}
          </button>
        </div>
      )}

      <DeleteDialog
        target={deleteTarget}
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteTarget(undefined);
          setDeleteError("");
        }}
        onConfirm={() => void confirmDelete()}
      />
      <FileDraftDialog
        target={fileDraftTarget}
        busy={fileDraftBusy}
        error={fileDraftError}
        onCancel={() => {
          if (fileDraftBusy) return;
          setFileDraftTarget(undefined);
          setFileDraftError("");
        }}
        onConfirm={(relativePath) => void fileDraftInWorkspace(relativePath)}
      />

      {closeCandidate && (
        <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-[60]">
          <div className="close-dialog">
            <h2>Save changes?</h2>
            <p>{closeCandidate.title || "This file"} has unsaved changes.</p>
            <div className="close-actions">
              <button className="confirm-btn" onClick={() => setCloseCandidate(undefined)}>
                Cancel
              </button>
              <button
                className="confirm-btn danger"
                onClick={async () => {
                  await loadDocument(await client.discard(closeCandidate.id));
                  setCloseCandidate(undefined);
                }}
              >
                Don&apos;t Save
              </button>
              <button
                className="confirm-btn primary"
                onClick={async () => {
                  if (await workspace.current?.save()) {
                    await loadDocument(await client.close(closeCandidate.id));
                    setCloseCandidate(undefined);
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
