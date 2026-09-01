import { memo, useEffect, useMemo, useRef, useState } from "react";

import { fileBadge, fileType, typeLabel } from "../workspace/documents";
import type {
  DraftFormat,
  NoteInfo,
  OutlineItem,
  RecentInfo,
  SessionState,
  WorkspaceFile,
  WorkspaceState,
} from "../workspace/types";
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "./icons";

const SIDEBAR_WORKSPACE_LIMIT = 300;

interface SidebarProps {
  session: SessionState;
  workspace: WorkspaceState;
  collapsed: boolean;
  outline: OutlineItem[];
  onCollapse(): void;
  onNew(format: DraftFormat): void;
  onActivate(id: string): void;
  onOpenPath(path: string): void;
  onToggleStar(id: string): void;
  onClose(note: NoteInfo): void;
  onRemoveRecent(path: string): void;
  onReorder(ids: string[]): void;
  onContext(note: NoteInfo, x: number, y: number): void;
  onOutline(line: number): void;
  onChooseWorkspace(): void;
  onRefreshWorkspace(): void;
  onClearWorkspace(): void;
  onSearchWorkspace(): void;
  onCreateWorkspaceFile(relativePath: string): void;
  onDeleteWorkspaceFile(file: WorkspaceFile): void;
}

type Section = "workspace" | "favorites" | "open" | "outline" | "recent";

function initialSections(): Record<Section, boolean> {
  try {
    return {
      workspace: false,
      favorites: false,
      open: false,
      outline: false,
      recent: false,
      ...JSON.parse(localStorage.getItem("markpad-sections") ?? "{}"),
    };
  } catch {
    return { workspace: false, favorites: false, open: false, outline: false, recent: false };
  }
}

function Badge({ path, kind }: { path: string; kind: string }) {
  const type = fileType(path, kind);
  return <span className={`file-badge file-badge-${type}`}>{fileBadge(path, kind)}</span>;
}

function SectionHead({
  name,
  label,
  closed,
  onToggle,
}: {
  name: Section;
  label: string;
  closed: boolean;
  onToggle(name: Section): void;
}) {
  return (
    <button data-section-toggle={name} className="section-head" onClick={() => onToggle(name)}>
      {closed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      <span>{label}</span>
    </button>
  );
}

function SidebarView({
  session,
  workspace,
  collapsed,
  outline,
  onCollapse,
  onNew,
  onActivate,
  onOpenPath,
  onToggleStar,
  onClose,
  onRemoveRecent,
  onReorder,
  onContext,
  onOutline,
  onChooseWorkspace,
  onRefreshWorkspace,
  onClearWorkspace,
  onSearchWorkspace,
  onCreateWorkspaceFile,
  onDeleteWorkspaceFile,
}: SidebarProps) {
  const [sections, setSections] = useState(initialSections);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [workspaceFileName, setWorkspaceFileName] = useState("");
  const workspaceCreateInput = useRef<HTMLInputElement>(null);
  const newMenu = useRef<HTMLDivElement>(null);
  const dragged = useRef("");
  const openPaths = useMemo(
    () => new Set(session.notes.filter((note) => note.path).map((note) => note.path)),
    [session.notes],
  );
  const recents = useMemo(
    () => session.recents.filter((recent) => !openPaths.has(recent.path)),
    [openPaths, session.recents],
  );

  useEffect(() => {
    if (!workspaceCreateOpen) return;
    const frame = requestAnimationFrame(() => workspaceCreateInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [workspaceCreateOpen]);

  useEffect(() => {
    if (!newMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !newMenu.current?.contains(event.target)) {
        setNewMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNewMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [newMenuOpen]);

  const toggle = (name: Section) => {
    setSections((current) => {
      const next = { ...current, [name]: !current[name] };
      localStorage.setItem("markpad-sections", JSON.stringify(next));
      return next;
    });
  };

  if (collapsed) {
    return (
      <aside
        id="sidebar"
        className="markpad-sidebar is-collapsed w-12 min-w-12 bg-sidebar border-r border-border flex flex-col items-center py-3 gap-2 select-none"
      >
        <button
          className="icon-btn"
          title="Expand sidebar"
          aria-label="Expand sidebar"
          onClick={onCollapse}
        >
          <PanelLeftOpen />
        </button>
        <button
          className="p-1.5 rounded-lg bg-accent text-accent-text w-7 h-7 flex items-center justify-center"
          title="New Markdown note"
          onClick={() => onNew("md")}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          className="icon-btn"
          title={workspace.root ? workspace.name : "Choose folder"}
          aria-label={
            workspace.root ? `Open workspace ${workspace.name}` : "Choose workspace folder"
          }
          onClick={workspace.root ? onSearchWorkspace : onChooseWorkspace}
        >
          <FolderOpen />
        </button>
      </aside>
    );
  }

  return (
    <aside
      id="sidebar"
      className="markpad-sidebar w-64 min-w-64 bg-sidebar border-r border-border flex flex-col overflow-hidden select-none"
    >
      <div className="sidebar-command-rail flex items-center justify-between p-3 gap-2 flex-shrink-0">
        <div ref={newMenu} className="new-menu-root relative flex">
          <button
            className="new-primary flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg bg-accent text-accent-text text-xs font-semibold hover:bg-accent-hover"
            title="New Markdown note (Ctrl+N)"
            onClick={() => {
              setNewMenuOpen(false);
              onNew("md");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
          <button
            className="new-menu-trigger flex items-center px-2 rounded-r-lg border-l border-white/20 bg-accent text-accent-text"
            aria-label="Choose new file type"
            aria-expanded={newMenuOpen}
            onClick={() => setNewMenuOpen((value) => !value)}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          {newMenuOpen && (
            <div className="new-menu" role="menu" aria-label="New file type">
              {(
                [
                  ["md", "Markdown", ".md"],
                  ["txt", "Plain text", ".txt"],
                  ["json", "JSON", ".json"],
                  ["yaml", "YAML", ".yaml"],
                ] as const
              ).map(([format, label, extension]) => (
                <button
                  key={format}
                  className="new-type-item"
                  role="menuitem"
                  onClick={() => {
                    onNew(format);
                    setNewMenuOpen(false);
                  }}
                >
                  <span>{label}</span>
                  <kbd>{extension}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="icon-btn"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          onClick={onCollapse}
        >
          <PanelLeftClose />
        </button>
      </div>
      <div className="sidebar-scroll flex-1 overflow-y-auto px-2 pb-2">
        <section className="workspace-cabinet">
          {workspace.root ? (
            <>
              <div className="workspace-section-head">
                <button
                  type="button"
                  className="workspace-title"
                  title={workspace.root}
                  onClick={() => toggle("workspace")}
                >
                  {sections.workspace ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  <span>
                    <strong>{workspace.name}</strong>
                    <small>{workspace.files.length} files</small>
                  </span>
                </button>
                <div className="workspace-actions">
                  <button
                    type="button"
                    title="Search folder (Ctrl+Shift+F)"
                    aria-label="Search folder"
                    onClick={onSearchWorkspace}
                  >
                    <Search />
                  </button>
                  <button
                    type="button"
                    title="New file in folder"
                    aria-label="New file in folder"
                    onClick={() => setWorkspaceCreateOpen((value) => !value)}
                  >
                    <FilePlus2 />
                  </button>
                  <button
                    type="button"
                    title="Refresh folder"
                    aria-label="Refresh folder"
                    onClick={onRefreshWorkspace}
                  >
                    <RefreshCw />
                  </button>
                  <button
                    type="button"
                    title="Choose another folder"
                    aria-label="Choose another folder"
                    onClick={onChooseWorkspace}
                  >
                    <FolderOpen />
                  </button>
                  <button
                    type="button"
                    title="Close folder"
                    aria-label="Close folder"
                    onClick={onClearWorkspace}
                  >
                    <X />
                  </button>
                </div>
              </div>
              {!sections.workspace ? (
                <>
                  <div className="workspace-root" title={workspace.root}>
                    {workspace.root}
                  </div>
                  {workspaceCreateOpen ? (
                    <form
                      className="workspace-create"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const relative = workspaceFileName.trim();
                        if (!relative) return;
                        onCreateWorkspaceFile(relative);
                        setWorkspaceFileName("");
                        setWorkspaceCreateOpen(false);
                      }}
                    >
                      <label htmlFor="workspace-new-file">New local file</label>
                      <div>
                        <input
                          ref={workspaceCreateInput}
                          id="workspace-new-file"
                          value={workspaceFileName}
                          placeholder="notes/idea.md"
                          onChange={(event) => setWorkspaceFileName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setWorkspaceCreateOpen(false);
                          }}
                        />
                        <button type="submit">Create</button>
                      </div>
                      <small>Relative to {workspace.name}; .md is added when omitted.</small>
                    </form>
                  ) : null}
                  <div className="workspace-file-list">
                    {workspace.files.length === 0 ? (
                      <div className="workspace-files-empty">No supported text files yet.</div>
                    ) : null}
                    {workspace.files.slice(0, SIDEBAR_WORKSPACE_LIMIT).map((file) => {
                      const splitAt = Math.max(
                        file.relative.lastIndexOf("/"),
                        file.relative.lastIndexOf("\\"),
                      );
                      const parent =
                        splitAt >= 0 ? file.relative.slice(0, splitAt) : "Workspace root";
                      return (
                        <div className="workspace-file-row" key={file.path} title={file.relative}>
                          <button
                            type="button"
                            className="workspace-file-open"
                            onClick={() => onOpenPath(file.path)}
                          >
                            <Badge path={file.path} kind={file.kind} />
                            <span>
                              <strong>{file.name}</strong>
                              <small>{parent}</small>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="workspace-file-delete"
                            aria-label={`Delete ${file.name}`}
                            title={`Delete ${file.relative}`}
                            onClick={() => onDeleteWorkspaceFile(file)}
                          >
                            <Trash2 />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {workspace.files.length > SIDEBAR_WORKSPACE_LIMIT ? (
                    <button type="button" className="workspace-more" onClick={onSearchWorkspace}>
                      {workspace.files.length - SIDEBAR_WORKSPACE_LIMIT} more files · use Ctrl+P
                    </button>
                  ) : null}
                  {workspace.truncated ? (
                    <div className="workspace-truncated">Folder scan reached its safety limit.</div>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <button type="button" className="workspace-choose" onClick={onChooseWorkspace}>
              <FolderOpen />
              <span>
                <strong>Open a folder</strong>
                <small>Browse and search local notes</small>
              </span>
            </button>
          )}
        </section>

        {session.favorites.length > 0 && (
          <section>
            <SectionHead
              name="favorites"
              label="Favorites"
              closed={sections.favorites}
              onToggle={toggle}
            />
            {!sections.favorites &&
              session.favorites.map((favorite) => (
                <button
                  key={favorite.path}
                  className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg hover:bg-hover text-left"
                  onClick={() => onOpenPath(favorite.path)}
                >
                  <Star className="h-3.5 w-3.5 fill-current text-star flex-shrink-0" />
                  <span className="text-[13px] font-medium truncate">
                    {favorite.title || "Untitled"}
                  </span>
                </button>
              ))}
            <div className="mx-2 border-t border-border-soft" />
          </section>
        )}

        <section>
          <SectionHead name="open" label="Open" closed={sections.open} onToggle={toggle} />
          {!sections.open &&
            session.notes.map((note) => {
              const active = note.id === session.activeId;
              return (
                <div
                  key={note.id}
                  className={`note-item group flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${active ? "active" : "hover:bg-hover"}`}
                  draggable
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onContext(note, event.clientX, event.clientY);
                  }}
                  onDragStart={() => {
                    dragged.current = note.id;
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!dragged.current || dragged.current === note.id) return;
                    const ids = session.notes.map((item) => item.id);
                    const from = ids.indexOf(dragged.current);
                    const to = ids.indexOf(note.id);
                    ids.splice(from, 1);
                    ids.splice(to, 0, dragged.current);
                    dragged.current = "";
                    onReorder(ids);
                  }}
                >
                  {note.path ? (
                    <button
                      className={`p-0.5 ${note.star ? "text-star" : "text-star-off opacity-0 group-hover:opacity-100"}`}
                      title={note.star ? "Unstar" : "Star"}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleStar(note.id);
                      }}
                    >
                      <Star className={`h-3.5 w-3.5 ${note.star ? "fill-current" : ""}`} />
                    </button>
                  ) : (
                    <span className="w-[18px]" />
                  )}
                  <button
                    type="button"
                    className="note-open flex flex-1 min-w-0 items-center gap-1.5 border-0 bg-transparent p-0 text-left"
                    aria-current={active ? "page" : undefined}
                    onClick={() => onActivate(note.id)}
                  >
                    <Badge path={note.path} kind={note.kind} />
                    <span className="flex-1 min-w-0">
                      <span className="note-title block text-[13px] font-medium truncate">
                        {note.path ? note.title : "Untitled"}
                      </span>
                      <span
                        className={`block text-[11px] ${note.dirty ? "text-unsaved font-semibold" : "text-muted"}`}
                      >
                        {note.dirty
                          ? "NOT SAVED"
                          : note.path
                            ? typeLabel(fileType(note.path, note.kind))
                            : "draft"}
                      </span>
                    </span>
                  </button>
                  <button
                    className="row-icon opacity-0 group-hover:opacity-100"
                    title="Close"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(note);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
        </section>

        {outline.length > 0 && (
          <section>
            <div className="mx-2 border-t border-border-soft" />
            <SectionHead
              name="outline"
              label="Outline"
              closed={sections.outline}
              onToggle={toggle}
            />
            {!sections.outline &&
              outline.map((item, index) => (
                <button
                  key={`${item.line}-${index}`}
                  className="w-full py-1 pr-2 text-left text-[11px] text-muted truncate hover:text-accent hover:bg-hover rounded"
                  style={{ paddingLeft: `${8 + (item.level - 1) * 10}px` }}
                  onClick={() => onOutline(item.line)}
                >
                  {item.text}
                </button>
              ))}
          </section>
        )}

        {recents.length > 0 && (
          <section>
            <div className="mx-2 border-t border-border-soft" />
            <SectionHead name="recent" label="Recent" closed={sections.recent} onToggle={toggle} />
            {!sections.recent &&
              recents.map((recent: RecentInfo) => (
                <div
                  key={recent.path}
                  className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-hover ${recent.missing ? "opacity-55" : "text-muted"}`}
                  title={recent.path}
                >
                  <button
                    type="button"
                    className="flex flex-1 min-w-0 items-center gap-1.5 border-0 bg-transparent p-0 text-left"
                    disabled={recent.missing}
                    onClick={() => onOpenPath(recent.path)}
                  >
                    <Badge path={recent.path} kind={recent.kind} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12px] truncate">{recent.title}</span>
                      <span className="block text-[10px] truncate text-muted">
                        {recent.missing ? "missing" : typeLabel(fileType(recent.path, recent.kind))}
                      </span>
                    </span>
                  </button>
                  <button
                    className="row-icon opacity-0 group-hover:opacity-100"
                    title="Remove from recent"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveRecent(recent.path);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </section>
        )}
      </div>
    </aside>
  );
}

export const Sidebar = memo(SidebarView);
