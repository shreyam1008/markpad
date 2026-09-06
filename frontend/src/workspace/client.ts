import { PRODUCT_NAME } from "../brand";
import type {
  DraftFormat,
  FileInfo,
  HistoryEntry,
  MarkpadAPI,
  SaveResult,
  SessionState,
  ViewMode,
  WorkspaceSearchResult,
  WorkspaceState,
} from "./types";

function api(): MarkpadAPI {
  const bound = window.go?.main?.App;
  if (!bound) throw new Error(`The ${PRODUCT_NAME} desktop API is not available`);
  return bound;
}

export const client = {
  session: (): Promise<SessionState> => api().GetSession(),
  activeContent: (): Promise<string> => api().GetActiveContent(),
  content: (id: string): Promise<string> => api().GetNoteContent(id),
  activate: (id: string): Promise<void> => api().SetActive(id),
  setView: (id: string, mode: ViewMode): Promise<void> => api().SetViewMode(id, mode),
  updateReadPosition: (id: string, editor: number, viewer: number, cursor: number): Promise<void> =>
    api().UpdateReadPosition(id, editor, viewer, cursor),
  create: (format: DraftFormat): Promise<SessionState> => api().NewNoteOfType(format),
  updateDraft: (id: string, content: string, dirty: boolean): Promise<void> =>
    api().UpdateContent(id, content, dirty),
  markDirty: (id: string): Promise<void> => api().MarkDirty(id),
  revert: (id: string, content: string, dirty: boolean): Promise<SessionState> =>
    api().RevertContent(id, content, dirty),
  save: (content: string, overwrite = false): Promise<SaveResult> =>
    api().SaveActive(content, overwrite),
  reloadSource: (markpadContent: string): Promise<SessionState> =>
    api().ReloadActiveFromDisk(markpadContent),
  saveAs: (content: string): Promise<SessionState> => api().SaveAsDialog(content),
  rename: (id: string, name: string): Promise<SessionState> => api().RenameNote(id, name),
  open: (): Promise<SessionState> => api().OpenFileDialog(),
  openDropped: (path: string): Promise<SessionState> => api().OpenDroppedFile(path),
  history: (id: string): Promise<HistoryEntry[]> => api().GetHistory(id),
  historyContent: (id: string, timestamp: string): Promise<string> =>
    api().GetHistoryContent(id, timestamp),
  restore: (id: string, timestamp: string): Promise<SessionState> =>
    api().RestoreVersion(id, timestamp),
  toggleStar: (id: string): Promise<SessionState> => api().ToggleStar(id),
  openPath: (path: string): Promise<SessionState> => api().OpenPathFromBookmark(path),
  close: (id: string): Promise<SessionState> => api().CloseNote(id),
  discard: (id: string): Promise<SessionState> => api().DiscardNote(id),
  removeRecent: (path: string): Promise<SessionState> => api().RemoveRecent(path),
  deleteDraft: (id: string): Promise<SessionState> => api().DeleteNote(id),
  fileInfo: (id: string): Promise<FileInfo> => api().GetFileInfo(id),
  openFolder: (path: string): Promise<void> => api().OpenContainingFolder(path),
  storagePath: (): Promise<string> => api().GetStoragePath(),
  readBase64: (path: string): Promise<string> => api().ReadFileBase64(path),
  readMarkdownAsset: (markdownPath: string, source: string): Promise<string> =>
    api().ReadMarkdownAsset(markdownPath, source),
  openURL: (url: string): Promise<void> => api().OpenURL(url),
  openExternal: (path: string): Promise<void> => api().OpenExternalPath(path),
  reorder: (ids: string[]): Promise<SessionState> => api().ReorderNotes(ids),
  workspace: (): Promise<WorkspaceState> => api().GetWorkspace(),
  chooseWorkspace: (): Promise<WorkspaceState> => api().ChooseWorkspace(),
  refreshWorkspace: (): Promise<WorkspaceState> => api().RefreshWorkspace(),
  clearWorkspace: (): Promise<WorkspaceState> => api().ClearWorkspace(),
  searchWorkspace: (query: string): Promise<WorkspaceSearchResult[]> =>
    api().SearchWorkspace(query),
  createWorkspaceFile: (relativePath: string): Promise<SessionState> =>
    api().CreateWorkspaceFile(relativePath),
  fileDraftInWorkspace: (relativePath: string, content: string): Promise<SessionState> =>
    api().FileDraftInWorkspace(relativePath, content),
  deleteFile: (path: string): Promise<SessionState> => api().DeleteFile(path),
  quitWithoutSaving: (): Promise<void> => api().QuitWithoutSaving(),
};
