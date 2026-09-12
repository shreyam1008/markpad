export type ViewMode = "markdown" | "split" | "viewer";
export type DraftFormat = "md" | "txt" | "json" | "yaml";
export type FileType = "md" | "text" | "code" | "pdf" | "image" | "ebook" | "office" | "archive";

export interface NoteInfo {
  id: string;
  title: string;
  path: string;
  dirty: boolean;
  star: boolean;
  kind: string;
  viewMode: ViewMode | "";
  size: number;
  scrollTop: number;
  viewTop: number;
  cursor: number;
}

export interface RecentInfo {
  path: string;
  title: string;
  kind: string;
  missing: boolean;
}

export interface SessionState {
  activeId: string;
  notes: NoteInfo[];
  favorites: NoteInfo[];
  recents: RecentInfo[];
}

export type SaveConflictKind = "modified" | "deleted" | "replaced" | "unverified";

export interface SaveConflictInfo {
  kind: SaveConflictKind;
  path: string;
  modified: string;
}

export interface SaveResult {
  session: SessionState;
  conflict?: SaveConflictInfo;
}

export interface HistoryEntry {
  timestamp: string;
  source: string;
  bytes: number;
  lines: number;
  preview: string;
  timeAgo: string;
}

export interface FileInfo {
  name: string;
  path: string;
  folder: string;
  size: number;
  kind: string;
  label: string;
  modified: string;
  readOnly: boolean;
}

export interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

export interface EditorStats {
  label: string;
  lines: number;
  words: number;
  characters: number;
  readMinutes: number;
}

export interface WorkspaceFile {
  path: string;
  relative: string;
  name: string;
  kind: string;
  size: number;
  modified: string;
}

export interface WorkspaceState {
  root: string;
  name: string;
  files: WorkspaceFile[];
  truncated: boolean;
}

export interface WorkspaceSearchResult {
  path: string;
  relative: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface MarkpadAPI {
  CheckForUpdates(): Promise<UpdateInfo>;
  DownloadAndOpenUpdate(): Promise<string>;
  GetSession(): Promise<SessionState>;
  GetActiveContent(): Promise<string>;
  GetNoteContent(id: string): Promise<string>;
  SetActive(id: string): Promise<void>;
  SetViewMode(id: string, mode: ViewMode): Promise<void>;
  UpdateReadPosition(id: string, scrollTop: number, viewTop: number, cursor: number): Promise<void>;
  NewNoteOfType(format: DraftFormat): Promise<SessionState>;
  UpdateContent(id: string, content: string, dirty: boolean): Promise<void>;
  MarkDirty(id: string): Promise<void>;
  RevertContent(id: string, content: string, dirty: boolean): Promise<SessionState>;
  SaveActive(content: string, overwrite: boolean): Promise<SaveResult>;
  ReloadActiveFromDisk(markpadContent: string): Promise<SessionState>;
  SaveAsDialog(content: string): Promise<SessionState>;
  RenameNote(id: string, name: string): Promise<SessionState>;
  OpenFileDialog(): Promise<SessionState>;
  OpenDroppedFile(path: string): Promise<SessionState>;
  GetHistory(id: string): Promise<HistoryEntry[]>;
  GetHistoryContent(id: string, timestamp: string): Promise<string>;
  RestoreVersion(id: string, timestamp: string): Promise<SessionState>;
  ToggleStar(id: string): Promise<SessionState>;
  OpenPathFromBookmark(path: string): Promise<SessionState>;
  CloseNote(id: string): Promise<SessionState>;
  DiscardNote(id: string): Promise<SessionState>;
  RemoveRecent(path: string): Promise<SessionState>;
  DeleteNote(id: string): Promise<SessionState>;
  GetFileInfo(id: string): Promise<FileInfo>;
  OpenContainingFolder(path: string): Promise<void>;
  GetStoragePath(): Promise<string>;
  ReadFileBase64(path: string): Promise<string>;
  ReadMarkdownAsset(markdownPath: string, source: string): Promise<string>;
  OpenURL(url: string): Promise<void>;
  OpenExternalPath(path: string): Promise<void>;
  ReorderNotes(ids: string[]): Promise<SessionState>;
  GetWorkspace(): Promise<WorkspaceState>;
  ChooseWorkspace(): Promise<WorkspaceState>;
  RefreshWorkspace(): Promise<WorkspaceState>;
  ClearWorkspace(): Promise<WorkspaceState>;
  SearchWorkspace(query: string): Promise<WorkspaceSearchResult[]>;
  CreateWorkspaceFile(relativePath: string): Promise<SessionState>;
  FileDraftInWorkspace(relativePath: string, content: string): Promise<SessionState>;
  DeleteFile(path: string): Promise<SessionState>;
  QuitWithoutSaving(): Promise<void>;
}

export interface MarkpadRuntime {
  ClipboardSetText?(text: string): Promise<boolean>;
  Environment?(): Promise<{ platform?: string }>;
  EventsOn(name: string, callback: (...args: unknown[]) => void): () => void;
  OnFileDrop(
    callback: (x: number, y: number, paths: string[]) => void,
    useDropTarget: boolean,
  ): void;
  WindowIsMaximised?(): Promise<boolean>;
  WindowMinimise?(): void;
  WindowToggleMaximise?(): void;
  Quit?(): void;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
  url: string;
  asset: string;
  digest: string;
  size: number;
  managed: string;
}

declare global {
  interface Window {
    go?: { main?: { App?: MarkpadAPI } };
    runtime?: MarkpadRuntime;
  }
}
