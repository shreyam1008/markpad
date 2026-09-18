// Exercise the public workspace handle with a real DOM and a delayed native save.
import assert from "node:assert/strict";

import { Window } from "happy-dom";

import type { DocumentWorkspaceHandle } from "../../src/components/DocumentWorkspace";
import type { NoteInfo, SessionState } from "../../src/workspace/types";

const window = new Window();
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  localStorage: window.localStorage,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { act, createElement, createRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { DocumentWorkspace } = await import("../../src/components/DocumentWorkspace");
const note: NoteInfo = {
  id: "note",
  title: "note.txt",
  path: "note.txt",
  kind: "text",
  dirty: false,
  star: false,
  size: 10,
  viewMode: "markdown",
  cursor: 0,
  scrollTop: 0,
  viewTop: 0,
};
let backendContent = "Saved note";
let backendDirty = false;
let reportedDirty = false;
const statuses: string[] = [];
let draftFailure: Error | undefined;
const draftWrites: { content: string; dirty: boolean }[] = [];
let positionWrites = 0;
let saveStarted!: () => void;
const started = new Promise<void>((resolve) => {
  saveStarted = resolve;
});
let finishSave!: () => void;
const finish = new Promise<void>((resolve) => {
  finishSave = resolve;
});
const session = (): SessionState => ({
  activeId: note.id,
  notes: [{ ...note, dirty: backendDirty }],
  favorites: [],
  recents: [],
});
Object.assign(window, {
  go: {
    main: {
      App: {
        UpdateContent: async (_id: string, content: string, dirty: boolean) => {
          draftWrites.push({ content, dirty });
          if (draftFailure) throw draftFailure;
          backendContent = content;
          backendDirty = dirty;
        },
        UpdateReadPosition: async () => {
          positionWrites++;
        },
        MarkDirty: async () => {
          backendDirty = true;
        },
        GetSession: async () => session(),
        SaveActive: async (content: string) => {
          saveStarted();
          await finish;
          backendContent = content;
          backendDirty = false;
          return { session: session() };
        },
      },
    },
  },
});
const element = window.document.createElement("div");
window.document.body.append(element);
const root = createRoot(element as unknown as HTMLElement);
const handle = createRef<DocumentWorkspaceHandle>();
const noop = () => undefined;
await act(async () => {
  root.render(
    createElement(DocumentWorkspace, {
      ref: handle,
      note,
      initialContent: backendContent,
      viewMode: "markdown",
      textSize: 16,
      themeKey: "light",
      findOpen: false,
      onCloseFind: noop,
      onSession: noop,
      onDocument: async () => undefined,
      onDirty: (dirty: boolean) => {
        reportedDirty = dirty;
      },
      onStatus: (message: string) => statuses.push(message),
      onStats: noop,
      onOutline: noop,
      onHistoryAvailability: noop,
      onTextZoom: noop,
      onEditTaskSource: noop,
    }),
  );
});
await act(async () => {
  await handle.current!.flush();
  await handle.current!.flush();
});
assert.equal(draftWrites.length, 0, "clean flush skips the source bridge");
assert.equal(positionWrites, 0, "unchanged positions skip the position bridge");
await act(async () => {
  handle.current!.format("bold");
});
const submitted = handle.current!.getContent();
let saving!: Promise<boolean>;
await act(async () => {
  saving = handle.current!.save();
  await started;
});
await act(async () => {
  handle.current!.format("italic");
});
const latest = handle.current!.getContent();
assert.notEqual(latest, submitted, "the second edit happened while Save was awaiting");
let saved = true;
await act(async () => {
  finishSave();
  saved = await saving;
});
assert.equal(saved, false, "newer edits prevent the caller from closing after Save");
assert.equal(reportedDirty, true, "newer edits remain dirty");
await act(async () => {
  await handle.current!.flush();
});
assert.equal(backendContent, latest, "recovery contains the newest edit");
assert.equal(backendDirty, true, "recovery keeps the newest edit unsaved");
assert.deepEqual(draftWrites.at(-1), { content: latest, dirty: true });
draftFailure = new Error("recovery disk full");
await act(async () => {
  handle.current!.format("bold");
  await assert.rejects(handle.current!.flush(), draftFailure);
});
const failedContent = handle.current!.getContent();
assert.notEqual(failedContent, latest, "a fresh edit reached the failed recovery write");
assert.equal(backendContent, latest, "a rejected write does not acknowledge the new source");
assert.equal(reportedDirty, true, "failed recovery leaves the current document dirty");
assert.equal(statuses.at(-1), "Could not preserve document state: Error: recovery disk full");
await act(async () => {
  handle.current!.format("italic");
});
const retryContent = handle.current!.getContent();
assert.notEqual(retryContent, failedContent, "editing remains available after failed recovery");
const attemptsBeforeRetry = draftWrites.length;
draftFailure = undefined;
await act(async () => {
  await handle.current!.flush();
  await handle.current!.flush();
});
assert.equal(draftWrites.length, attemptsBeforeRetry + 1, "successful retry alone is acknowledged");
assert.equal(
  backendContent,
  retryContent,
  "retry preserves the newest source, not the failed snapshot",
);
assert.equal(backendDirty, true, "the retried recovery remains unsaved");
assert.equal(handle.current!.getContent(), retryContent, "flush never replaces the editor source");
await act(async () => {
  root.unmount();
});
await window.happyDOM.close();
console.log("Workspace DOM: clean flush, delayed save edits, and visible recovery retry passed");
