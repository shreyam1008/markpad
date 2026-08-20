import { describe, expect, test } from "bun:test";

import { initialWorkspaceState, workspaceReducer } from "../src/workspace/state";
import type { SessionState } from "../src/workspace/types";

const session: SessionState = {
  activeId: "a",
  favorites: [],
  recents: [],
  notes: [
    {
      id: "a",
      title: "A.md",
      path: "/tmp/A.md",
      dirty: false,
      star: false,
      kind: "markdown",
      viewMode: "split",
      size: 1,
      scrollTop: 0,
      viewTop: 0,
      cursor: 0,
    },
  ],
};

describe("workspace reducer", () => {
  test("loads one authoritative session snapshot", () => {
    const state = workspaceReducer(initialWorkspaceState, {
      type: "loaded",
      session,
      content: "# A",
    });
    expect(state.ready).toBe(true);
    expect(state.session).toBe(session);
    expect(state.content).toBe("# A");
    expect(state.viewMode).toBe("split");
  });

  test("replaces document content on activation", () => {
    const loaded = workspaceReducer(initialWorkspaceState, {
      type: "loaded",
      session,
      content: "one",
    });
    const next = workspaceReducer(loaded, { type: "document", session, content: "two" });
    expect(next.content).toBe("two");
    expect(next.contentVersion).toBe(2);
  });
});
