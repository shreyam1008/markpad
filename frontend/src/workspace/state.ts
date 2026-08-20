import { defaultView } from "./documents";
import type { SessionState, ViewMode } from "./types";

export interface WorkspaceState {
  session: SessionState;
  content: string;
  contentVersion: number;
  viewMode: ViewMode;
  status: string;
  ready: boolean;
}

export type WorkspaceAction =
  | { type: "loaded"; session: SessionState; content: string }
  | { type: "session"; session: SessionState }
  | { type: "document"; session: SessionState; content: string }
  | { type: "view"; mode: ViewMode }
  | { type: "status"; status: string };

export const emptySession: SessionState = {
  activeId: "",
  notes: [],
  favorites: [],
  recents: [],
};

export const initialWorkspaceState: WorkspaceState = {
  session: emptySession,
  content: "",
  contentVersion: 0,
  viewMode: "markdown",
  status: "Starting…",
  ready: false,
};

function active(session: SessionState) {
  return session.notes.find((note) => note.id === session.activeId);
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "loaded":
      return {
        ...state,
        session: action.session,
        content: action.content,
        contentVersion: state.contentVersion + 1,
        viewMode: defaultView(active(action.session)),
        status: "Ready",
        ready: true,
      };
    case "document":
      return {
        ...state,
        session: action.session,
        content: action.content,
        contentVersion: state.contentVersion + 1,
        viewMode: defaultView(active(action.session)),
      };
    case "session": {
      const supported = active(action.session);
      return {
        ...state,
        session: action.session,
        viewMode:
          supported?.id === state.session.activeId ? state.viewMode : defaultView(supported),
      };
    }
    case "view":
      return { ...state, viewMode: action.mode };
    case "status":
      return { ...state, status: action.status };
  }
}
