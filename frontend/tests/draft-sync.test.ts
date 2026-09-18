import { expect, test } from "bun:test";

import {
  DraftSync,
  ReadPositionSync,
  type DraftState,
  type ReadPosition,
} from "../src/workspace/draft-sync";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function draftSync(
  initial: DraftState,
  current: () => DraftState,
  write: (draft: DraftState) => Promise<void>,
) {
  const sync = new DraftSync(initial, write);
  return {
    flush: () => sync.flush(current),
    mutate: <T>(operation: () => Promise<T>) => sync.mutate(operation),
  };
}

function fixture(initial: DraftState = { content: "Saved note", dirty: false }) {
  let current = initial;
  const writes: DraftState[] = [];
  const sync = draftSync(
    initial,
    () => current,
    async (draft) => {
      writes.push(draft);
    },
  );
  return {
    sync,
    writes,
    edit: (draft: DraftState) => {
      current = draft;
    },
  };
}

test("unchanged clean and recovered dirty drafts need no source bridge calls", async () => {
  for (const dirty of [false, true]) {
    const { sync, writes } = fixture({ content: "Already loaded", dirty });
    expect(await sync.flush()).toBe(false);
    expect(await sync.flush()).toBe(false);
    expect(writes).toEqual([]);
  }
});

test("task metadata source edits persist even when the dirty flag stays true", async () => {
  const { sync, writes, edit } = fixture({
    content: "<!-- quillpane:tasks -->\n# Tasks",
    dirty: true,
  });
  edit({ content: "<!-- quillpane:tasks -->\n# Tasks\n- [x] Finished", dirty: true });
  expect(await sync.flush()).toBe(true);
  expect(await sync.flush()).toBe(false);
  expect(writes).toEqual([
    { content: "<!-- quillpane:tasks -->\n# Tasks\n- [x] Finished", dirty: true },
  ]);
});

test("typing then undoing to original clears a separately marked backend dirty flag", async () => {
  const { sync, writes } = fixture();
  let marked = false;
  await sync.mutate(async () => {
    marked = true;
  });
  expect(await sync.flush()).toBe(true);
  expect(marked).toBe(true);
  expect(writes).toEqual([{ content: "Saved note", dirty: false }]);
});

test("concurrent flushes share one drain and preserve edits arriving during a write", async () => {
  const started = deferred();
  const finish = deferred();
  let current = { content: "First edit", dirty: true };
  const writes: DraftState[] = [];
  const sync = draftSync(
    { content: "Saved", dirty: false },
    () => current,
    async (draft) => {
      writes.push(draft);
      if (writes.length === 1) {
        started.resolve();
        await finish.promise;
      }
    },
  );
  const first = sync.flush();
  expect(sync.flush()).toBe(first);
  await started.promise;
  current = { content: "Latest edit", dirty: true };
  finish.resolve();
  await first;
  expect(writes.map((draft) => draft.content)).toEqual(["First edit", "Latest edit"]);
  expect(await sync.flush()).toBe(false);
});

test("a MarkDirty queued during a write is followed by the latest draft", async () => {
  const started = deferred();
  const finish = deferred();
  let current = { content: "First", dirty: true };
  const events: string[] = [];
  const sync = draftSync(
    { content: "Saved", dirty: false },
    () => current,
    async (draft) => {
      events.push(`write:${draft.content}:${draft.dirty}`);
      if (events.length === 1) {
        started.resolve();
        await finish.promise;
      }
    },
  );
  const flushing = sync.flush();
  await started.promise;
  const marked = sync.mutate(async () => {
    events.push("mark dirty");
  });
  current = { content: "Saved", dirty: false };
  finish.resolve();
  await Promise.all([marked, flushing]);
  expect(events).toEqual(["write:First:true", "mark dirty", "write:Saved:false"]);
});

test("failed recovery remains unacknowledged and is retried before switching", async () => {
  const current = { content: "Unsaved", dirty: true };
  let attempts = 0;
  const sync = draftSync(
    { content: "Saved", dirty: false },
    () => current,
    async () => {
      if (++attempts === 1) throw new Error("disk full");
    },
  );
  await expect(sync.flush()).rejects.toThrow("disk full");
  expect(await sync.flush()).toBe(true);
  expect(attempts).toBe(2);
  expect(await sync.flush()).toBe(false);
});

test("save and revert cannot leave a stale draft acknowledgement", async () => {
  const { sync, writes, edit } = fixture();
  edit({ content: "Edited", dirty: true });
  await sync.flush();
  await sync.mutate(async () => undefined);
  edit({ content: "Edited", dirty: false });
  await sync.flush();
  await expect(
    sync.mutate(async () => {
      throw new Error("save failed");
    }),
  ).rejects.toThrow();
  await sync.flush();
  expect(writes).toEqual([
    { content: "Edited", dirty: true },
    { content: "Edited", dirty: false },
    { content: "Edited", dirty: false },
  ]);
});

test("unchanged rounded positions skip the bridge while cursor and both panes still persist", async () => {
  let current = { editor: 12.2, viewer: 41.8, cursor: 3 };
  const writes: ReadPosition[] = [];
  const sync = new ReadPositionSync({ editor: 12, viewer: 42, cursor: 3 }, async (position) => {
    writes.push(position);
  });
  expect(await sync.flush(() => current)).toBe(false);
  current = { editor: 12.4, viewer: 41.6, cursor: 4 };
  await sync.flush(() => current);
  current = { editor: 50.8, viewer: 82.3, cursor: 4 };
  await sync.flush(() => current);
  expect(writes).toEqual([
    { editor: 12, viewer: 42, cursor: 4 },
    { editor: 51, viewer: 82, cursor: 4 },
  ]);
});
