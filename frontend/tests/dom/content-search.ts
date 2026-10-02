// Exercise the real open-note search panel and asynchronous native-content boundary.
import assert from "node:assert/strict";

import { Window } from "happy-dom";

import type { OpenNoteSearchMatch } from "../../src/workspace/content-search";
import type {
  NoteInfo,
  OpenNoteSearchCursor,
  OpenNoteSearchSnapshot,
} from "../../src/workspace/types";

const window = new Window();
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ContentSearchPanel } = await import("../../src/components/ContentSearchPanel");

function note(id: string, title = `${id}.txt`, kind = "text"): NoteInfo {
  return {
    id,
    title,
    path: id === "draft" ? "" : title,
    kind,
    dirty: id === "draft",
    star: false,
    size: 10,
    viewMode: "markdown",
    cursor: 0,
    scrollTop: 0,
    viewTop: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

const opener = window.document.createElement("button");
opener.textContent = "Search";
const editor = window.document.createElement("textarea");
const element = window.document.createElement("div");
window.document.body.append(opener, editor, element);
const root = createRoot(element as unknown as HTMLElement);
let closed = 0;
const selections: OpenNoteSearchMatch[] = [];
const onClose = () => {
  closed++;
  root.render(null);
};
const onSelect = async (match: OpenNoteSearchMatch) => {
  selections.push(match);
};
const wait = (milliseconds = 120) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const snapshotCalls: { ids: string[]; budget: number }[] = [];

async function render(
  notes: NoteInfo[],
  activeId: string,
  loadContent: (id: string) => Promise<string>,
  select = onSelect,
  loadSnapshot?: (
    ids: string[],
    budget: number,
    cursor: OpenNoteSearchCursor | null,
  ) => Promise<OpenNoteSearchSnapshot>,
) {
  await act(async () => {
    root.render(
      createElement(ContentSearchPanel, {
        notes,
        activeId,
        loadContent,
        loadSnapshot:
          loadSnapshot ??
          (async (ids, budget) => {
            snapshotCalls.push({ ids, budget });
            const snapshot: OpenNoteSearchSnapshot = {
              notes: [],
              skippedIds: [],
              failedIds: [],
              pendingIds: [],
              nextCursor: null,
            };
            let remaining = budget;
            for (const id of ids) {
              try {
                const content = await loadContent(id);
                if (content.length > remaining) snapshot.skippedIds.push(id);
                else {
                  snapshot.notes.push({ id, content, complete: true });
                  remaining -= content.length;
                }
              } catch {
                snapshot.failedIds.push(id);
              }
            }
            return snapshot;
          }),
        onSelect: select,
        onClose,
      }),
    );
  });
}

function input() {
  const found = element.querySelector<HTMLInputElement>('input[type="search"]');
  assert.ok(found, "the search input is mounted");
  return found;
}

async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      input(),
      value,
    );
    input().dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function key(value: string, target = input()) {
  await act(async () => {
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true }));
  });
}

async function settle(milliseconds = 120) {
  await act(async () => {
    await wait(milliseconds);
  });
}

async function clear() {
  await act(async () => {
    root.render(null);
  });
}

opener.focus();
const reads: string[] = [];
let liveReads = 0;
let mostLiveReads = 0;
const contents: Record<string, string> = {
  saved: "<script>needle</script>\nA second needle",
  draft: "unsaved needle\nneedle exists",
};
const loadContent = async (id: string) => {
  reads.push(id);
  liveReads++;
  mostLiveReads = Math.max(mostLiveReads, liveReads);
  await wait(1);
  liveReads--;
  assert.ok(id in contents, "binary documents are never read as searchable text");
  return contents[id];
};
const notes = [note("saved"), note("draft", "Untitled"), note("picture", "photo.png", "image")];
await render(notes, "draft", loadContent);
assert.equal(window.document.activeElement, input(), "opening search focuses its input");
const bubbledKeys: string[] = [];
const recordKey = (event: KeyboardEvent) => {
  bubbledKeys.push(event.key);
};
window.document.addEventListener("keydown", recordKey);
await act(async () => {
  for (const editKey of ["z", "y", "b", "i", "k"]) {
    const event = new window.KeyboardEvent("keydown", {
      key: editKey,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input().dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, "query input retains its native editing behavior");
  }
});
assert.deepEqual(bubbledKeys, [], "query editing shortcuts cannot reach document-edit hotkeys");
window.document.removeEventListener("keydown", recordKey);
await settle(20);
assert.deepEqual(reads, ["draft", "saved"], "the active unsaved draft is read before saved notes");
assert.equal(mostLiveReads, 1, "the live buffer is read before requesting inactive contents");
assert.deepEqual(
  snapshotCalls,
  [{ ids: ["saved"], budget: 16 * 1024 * 1024 - contents.draft.length }],
  "small inactive text notes fit one bounded native page",
);
await type("needle");
await settle();
assert.equal(element.querySelectorAll(".content-search-result").length, 4);
assert.equal(
  element.querySelectorAll(".content-search-group").length,
  2,
  "matches are grouped by note",
);
assert.equal(element.querySelectorAll("mark").length, 4);
assert.equal(element.querySelector("mark")?.textContent, "needle");
assert.equal(element.querySelector("script"), null, "HTML source snippets remain literal text");
assert.match(element.textContent ?? "", /<script>needle<\/script>/);
await key("ArrowDown");
assert.equal(
  element.querySelector('[aria-current="true"]')?.textContent?.includes("Line 2:1"),
  true,
);
await key("ArrowUp");
assert.equal(
  element.querySelector('[aria-current="true"]')?.textContent?.includes("Line 1:9"),
  true,
);
await key("ArrowDown");
await key("Enter");
assert.equal(selections.at(-1)?.noteId, "draft");
assert.equal(selections.at(-1)?.line, 2);
assert.equal(selections.at(-1)?.column, 1);
assert.equal(
  selections.at(-1)?.text,
  "needle",
  "selection carries the exact source for freshness checks",
);
await type("second");
await settle();
assert.equal(element.querySelectorAll(".content-search-result").length, 1);
assert.deepEqual(reads, ["draft", "saved"], "query changes reuse the content snapshot");
await render(
  notes.map((entry) => ({ ...entry, dirty: !entry.dirty })),
  "draft",
  loadContent,
);
assert.deepEqual(
  reads,
  ["draft", "saved"],
  "ordinary metadata refreshes retain the content snapshot",
);
await type("missing");
await settle();
assert.match(element.textContent ?? "", /No matching text in open notes/);
await type("x".repeat(257));
assert.match(element.textContent ?? "", /Use up to 256 characters/);
await key("Escape");
assert.equal(closed, 1);
assert.equal(window.document.activeElement, opener, "Escape restores the search opener");

opener.focus();
await render([note("saved")], "saved", async () => "Searchable writing");
await type("writng");
await settle();
assert.equal(
  element.querySelectorAll(".content-search-result").length,
  0,
  "typo tolerance is opt in",
);
const typo = element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
await act(async () => {
  typo.click();
});
await settle();
assert.equal(element.querySelectorAll(".content-search-result").length, 1);
assert.match(element.textContent ?? "", /Near match/);
assert.equal(element.querySelector("mark")?.textContent, "writing");
await clear();

const mixedContents: Record<string, string> = { first: "writing\nwritng", second: "writing" };
await render([note("first"), note("second")], "first", async (id) => mixedContents[id]);
await type("writing");
await act(async () => {
  element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
});
await settle();
const mixedResults = Array.from(
  element.querySelectorAll(".content-search-result"),
  (button) => button.getAttribute("aria-label") ?? "",
);
assert.match(mixedResults[0], /^first\.txt, line 1/);
assert.match(mixedResults[1], /^second\.txt, line 1/);
assert.match(mixedResults[2], /^first\.txt, line 2.*near match/);
assert.match(element.querySelector("output")?.textContent ?? "", /3 matches in 2 notes/);
await key("ArrowDown");
assert.match(
  element.querySelector('[aria-current="true"]')?.getAttribute("aria-label") ?? "",
  /^second\.txt/,
);
await key("ArrowDown");
await key("Enter");
assert.equal(selections.at(-1)?.noteId, "first");
assert.equal(
  selections.at(-1)?.fuzzy,
  true,
  "keyboard navigation follows the exact-first visual order",
);
await clear();

opener.focus();
await render(
  [note("saved")],
  "saved",
  async () => "writing writng",
  async () => {
    throw new Error("note was closed");
  },
);
await type("writing");
await settle();
await act(async () => {
  element.querySelector<HTMLButtonElement>(".content-search-result")!.click();
});
assert.match(
  element.querySelector('[role="alert"]')?.textContent ?? "",
  /Could not open this match/,
);
assert.equal(element.querySelector<HTMLButtonElement>(".content-search-result")?.disabled, false);
await key("Escape");
assert.equal(
  window.document.activeElement,
  opener,
  "failed navigation keeps normal close-focus restoration",
);

opener.focus();
await render(
  [note("saved")],
  "saved",
  async () => "find this exact line",
  async (match) => {
    selections.push(match);
    root.render(null);
    editor.focus();
  },
);
await type("exact");
await settle();
await act(async () => {
  element.querySelector<HTMLButtonElement>(".content-search-result")!.click();
});
assert.equal(
  window.document.activeElement,
  editor,
  "opening a result preserves editor focus on panel cleanup",
);

const oldRead = deferred<string>();
const staleReads: string[] = [];
const readWithDelay = async (id: string) => {
  staleReads.push(id);
  return id === "old" ? oldRead.promise : "fresh note text";
};
opener.focus();
await render([note("old"), note("not-started")], "old", readWithDelay);
assert.match(element.textContent ?? "", /Reading open notes/);
await type("fresh");
await render([note("fresh")], "fresh", readWithDelay);
await settle();
assert.equal(element.querySelectorAll(".content-search-result").length, 1);
assert.match(element.textContent ?? "", /fresh\.txt/);
await act(async () => {
  oldRead.resolve("stale fresh content");
});
await settle();
assert.deepEqual(
  staleReads,
  ["old", "fresh"],
  "cancelled snapshots do not continue reading old notes",
);
assert.equal(
  element.querySelectorAll(".content-search-result").length,
  1,
  "stale reads cannot replace current results",
);
assert.doesNotMatch(element.textContent ?? "", /old\.txt/);
await type("note");
await type("absent");
await settle();
assert.equal(
  element.querySelectorAll(".content-search-result").length,
  0,
  "replaced queries cannot display stale results",
);
assert.match(element.textContent ?? "", /No matching text/);
await clear();

const returningRead = deferred<string>();
const abandonedRead = deferred<string>();
let firstReads = 0;
const readReturningScope = async (id: string) => {
  if (id === "first") return ++firstReads === 1 ? "old target" : returningRead.promise;
  return abandonedRead.promise;
};
await render([note("first")], "first", readReturningScope);
await type("target");
await settle();
assert.equal(element.querySelectorAll(".content-search-result").length, 1);
await render([note("second")], "second", readReturningScope);
await render([note("first")], "first", readReturningScope);
assert.equal(
  element.querySelectorAll(".content-search-result").length,
  0,
  "returning to a scope cannot reuse its earlier snapshot",
);
await act(async () => {
  returningRead.resolve("fresh target");
});
await settle();
assert.match(element.querySelector(".content-search-snippet")?.textContent ?? "", /fresh target/);
await act(async () => {
  abandonedRead.resolve("obsolete target");
});
await settle(20);
assert.doesNotMatch(element.textContent ?? "", /obsolete target/);
await clear();

opener.focus();
await render([note("broken"), note("saved")], "saved", async (id) => {
  if (id === "broken") throw new Error("read failed");
  return "available text";
});
await type("available");
await settle();
assert.match(
  element.querySelector('[role="alert"]')?.textContent ?? "",
  /Could not read 1 note: broken\.txt/,
);
assert.equal(
  element.querySelectorAll(".content-search-result").length,
  1,
  "a read failure retains results from readable notes",
);
await act(async () => {
  editor.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
});
assert.equal(
  element.querySelector(".content-search-panel"),
  null,
  "outside pointer presses close search before editing",
);
assert.equal(closed, 3);

opener.focus();
await render([note("many")], "many", async () => "word ".repeat(500));
await type("word");
await settle();
assert.match(element.textContent ?? "", /Showing the first \d+ matches/);
assert.ok(
  element.querySelectorAll(".content-search-result").length < 500,
  "the result UI is bounded",
);
await clear();

const largeReads: string[] = [];
const large = "x".repeat(9 * 1024 * 1024);
await render(
  [note("large"), note("overflow"), note("later")],
  "large",
  async (id) => {
    largeReads.push(id);
    return large;
  },
  onSelect,
  async (ids, budget) => {
    assert.deepEqual(ids, ["overflow", "later"]);
    assert.equal(budget, 7 * 1024 * 1024, "native budget subtracts the latest active buffer");
    return {
      notes: [{ id: "later", content: "a later target", complete: true }],
      skippedIds: ["overflow"],
      failedIds: [],
      pendingIds: [],
      nextCursor: null,
    };
  },
);
await settle(20);
assert.deepEqual(largeReads, ["large"], "inactive contents never use the unbounded note API");
assert.match(element.textContent ?? "", /1 open note was not searched/);
await type("target");
await settle();
assert.equal(
  element.querySelector("mark")?.textContent,
  "target",
  "a skipped large note does not hide later small notes",
);
await type("missing");
await settle();
assert.match(
  element.textContent ?? "",
  /No matching text in the searched notes/,
  "partial-scope misses do not claim all notes were searched",
);
await clear();

await render(
  [note("overflow"), note("later")],
  "overflow",
  async () => "x".repeat(17 * 1024 * 1024),
  onSelect,
  async (ids, budget) => {
    assert.deepEqual(ids, ["later"]);
    assert.equal(
      budget,
      16 * 1024 * 1024,
      "omitting a giant live note preserves the budget for other notes",
    );
    return {
      notes: [{ id: "later", content: "tiny target", complete: true }],
      skippedIds: [],
      failedIds: [],
      pendingIds: [],
      nextCursor: null,
    };
  },
);
await type("target");
await settle();
assert.equal(element.querySelector("mark")?.textContent, "target");
assert.match(element.textContent ?? "", /1 open note was not searched/);
await clear();

await render(
  [note("active"), note("failed-a"), note("failed-b")],
  "active",
  async () => "live target",
  onSelect,
  async () => {
    throw new Error("native snapshot failed");
  },
);
await type("target");
await settle();
assert.equal(
  element.querySelector("mark")?.textContent,
  "target",
  "a native snapshot failure retains the latest live buffer",
);
assert.match(element.textContent ?? "", /Could not read 2 notes/);
await clear();

const pageCursor: OpenNoteSearchCursor = {
  id: "paged",
  offsetBytes: 9,
  sourcePath: "private-draft",
  size: 19,
  modTime: "1234567890123456789",
  totalUnits: 19,
  emittedUnits: 9,
};
const pageRequests: (OpenNoteSearchCursor | null)[] = [];
await render(
  [note("active"), note("paged"), note("later")],
  "active",
  async () => "live",
  onSelect,
  async (ids, budget, cursor) => {
    pageRequests.push(cursor);
    assert.equal(budget, 16 * 1024 * 1024 - 4, "partial notes are charged once, on completion");
    assert.deepEqual(ids, ["paged", "later"]);
    return cursor
      ? {
          notes: [
            { id: "paged", content: "ged needle", complete: true },
            { id: "later", content: "later text", complete: true },
          ],
          skippedIds: [],
          failedIds: [],
          pendingIds: [],
          nextCursor: null,
        }
      : {
          notes: [{ id: "paged", content: "needle pa", complete: false }],
          skippedIds: [],
          failedIds: [],
          pendingIds: ["paged", "later"],
          nextCursor: pageCursor,
        };
  },
);
await type("paged");
await settle();
assert.deepEqual(pageRequests, [null, pageCursor], "the native cursor is returned unchanged");
assert.equal(element.querySelector("mark")?.textContent, "paged", "matches span bridge pages");
assert.match(element.querySelector(".content-search-result")?.textContent ?? "", /Line 1:8/);
await clear();

let changingPages = 0;
await render(
  [note("active"), note("paged"), note("later")],
  "active",
  async () => "live",
  onSelect,
  async (_ids, budget) => {
    assert.equal(
      budget,
      16 * 1024 * 1024 - 4,
      "discarded fragments leave later notes their full budget",
    );
    changingPages++;
    if (changingPages === 1)
      return {
        notes: [{ id: "paged", content: "stale target", complete: false }],
        skippedIds: [],
        failedIds: [],
        pendingIds: ["paged", "later"],
        nextCursor: pageCursor,
      };
    return {
      notes: [{ id: "later", content: "fresh target", complete: true }],
      skippedIds: [],
      failedIds: ["paged"],
      pendingIds: [],
      nextCursor: null,
    };
  },
);
await type("target");
await settle();
assert.equal(
  element.querySelectorAll("mark").length,
  1,
  "incomplete changed notes are never searched",
);
assert.match(element.querySelector(".content-search-snippet")?.textContent ?? "", /fresh target/);
assert.match(element.textContent ?? "", /Could not read 1 note: paged\.txt/);
await clear();

const cancelledPage = deferred<OpenNoteSearchSnapshot>();
let cancelledPageCalls = 0;
await render(
  [note("active"), note("paged"), note("later")],
  "active",
  async () => "live",
  onSelect,
  async () => {
    cancelledPageCalls++;
    return cancelledPage.promise;
  },
);
await settle(10);
await clear();
await act(async () => {
  cancelledPage.resolve({
    notes: [{ id: "paged", content: "needle pa", complete: false }],
    skippedIds: [],
    failedIds: [],
    pendingIds: ["paged", "later"],
    nextCursor: pageCursor,
  });
});
await settle(10);
assert.equal(cancelledPageCalls, 1, "closing search stops requesting remaining pages");

await render(
  [note("active"), note("stalled")],
  "active",
  async () => "live target",
  onSelect,
  async () => ({
    notes: [],
    skippedIds: [],
    failedIds: [],
    pendingIds: ["stalled"],
    nextCursor: null,
  }),
);
await type("target");
await settle();
assert.equal(
  element.querySelector("mark")?.textContent,
  "target",
  "a stalled page preserves complete notes",
);
assert.match(element.textContent ?? "", /Could not read 1 note: stalled\.txt/);
await clear();

await act(async () => {
  root.unmount();
});
await window.happyDOM.close();
console.log(
  "Open-note search DOM: snapshots, safe highlights, keyboard/focus, stale reads, errors, and bounds passed",
);
