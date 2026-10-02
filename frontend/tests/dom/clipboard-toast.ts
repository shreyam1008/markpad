// Exercise the real toast with clipboard bridge promises and a deterministic clock.
import assert from "node:assert/strict";

import { Window } from "happy-dom";

const window = new Window();
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ClipboardToast } = await import("../../src/components/ClipboardToast");
const { writeClipboard } = await import("../../src/preview/clipboard");

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const timers = new Map<number, { at: number; callback(): void }>();
let now = 0;
let timerId = 0;
globalThis.setTimeout = ((
  callback: (...args: unknown[]) => void,
  delay = 0,
  ...args: unknown[]
) => {
  const id = ++timerId;
  timers.set(id, { at: now + delay, callback: () => callback(...args) });
  return id;
}) as unknown as typeof setTimeout;
globalThis.clearTimeout = ((id: number) => timers.delete(id)) as unknown as typeof clearTimeout;

async function advance(milliseconds: number) {
  await act(async () => {
    const target = now + milliseconds;
    for (;;) {
      const next = Array.from(timers)
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
      await Promise.resolve();
    }
    now = target;
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

let clipboardRead = async () => "";
let clipboardWrite = async (_text: string) => true;
let readCount = 0;
let writeCount = 0;
Object.assign(window, {
  runtime: {
    ClipboardGetText: () => {
      readCount++;
      return clipboardRead();
    },
    ClipboardSetText: (text: string) => {
      writeCount++;
      return clipboardWrite(text);
    },
  },
});
const host = window.document.createElement("div");
const textarea = window.document.createElement("textarea");
const input = window.document.createElement("input");
input.type = "search";
const prose = window.document.createElement("p");
prose.textContent = "Selected viewer text 🌍";
window.document.body.append(textarea, input, prose, host);
const root = createRoot(host as unknown as HTMLElement);
const visible = () => Boolean(host.querySelector(".clipboard-toast-message"));

async function mount() {
  await act(async () => {
    root.render(createElement(ClipboardToast));
  });
}
async function clear() {
  await act(async () => {
    root.render(null);
  });
  assert.equal(timers.size, 0, "unmount clears pending verification and hide timers");
}
async function successfulWrite(text = "Copied programmatically 🌍") {
  clipboardWrite = async () => true;
  await act(async () => {
    await writeClipboard(text);
  });
}
async function copy(
  target: typeof textarea | typeof input | typeof prose = textarea,
  suppliedText?: string,
  prevented = false,
) {
  const data = new window.DataTransfer();
  if (suppliedText !== undefined) data.setData("text/plain", suppliedText);
  const event = new window.ClipboardEvent("copy", {
    bubbles: true,
    cancelable: true,
    clipboardData: data,
  });
  if (prevented) event.preventDefault();
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

try {
  await mount();
  const writing = deferred<boolean>();
  clipboardWrite = () => writing.promise;
  let pendingWrite!: Promise<void>;
  await act(async () => {
    pendingWrite = writeClipboard("Pending write");
  });
  assert.equal(visible(), false, "programmatic writes show no toast before success");
  await act(async () => {
    writing.resolve(true);
    await pendingWrite;
  });
  assert.equal(host.querySelector(".clipboard-toast-message")?.textContent, "Copied to clipboard");
  await advance(999);
  assert.equal(visible(), true, "success stays visible for the full one-second interval");
  await advance(1);
  assert.equal(visible(), false, "success hides at 1000 ms");
  await successfulWrite();
  await advance(600);
  await successfulWrite();
  await advance(400);
  assert.equal(visible(), true, "a second success replaces the first hide deadline");
  await advance(599);
  assert.equal(visible(), true);
  await advance(1);
  assert.equal(visible(), false, "repeated success hides 1000 ms after the last copy");
  clipboardWrite = async () => false;
  await act(async () => {
    await assert.rejects(writeClipboard("Rejected"), /Clipboard write failed/);
  });
  const writesBeforeEmpty = writeCount;
  await act(async () => {
    await writeClipboard("");
  });
  assert.equal(writeCount, writesBeforeEmpty, "empty helper writes do not touch the clipboard");
  assert.equal(visible(), false, "failed and empty writes show no success");
  await clear();

  await mount();
  textarea.value = "Before 🌍\nAfter";
  textarea.setSelectionRange(7, 15);
  const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  clipboardRead = async () => selected.replace(/\n/g, "\r\n");
  const writesBeforeNative = writeCount;
  const nativeCopy = await copy();
  assert.equal(visible(), false, "native copy waits until after its default action");
  await advance(0);
  assert.equal(visible(), true, "textarea selection confirms Unicode and CRLF readback");
  assert.equal(nativeCopy.defaultPrevented, false, "native copy is never overridden");
  assert.equal(writeCount, writesBeforeNative, "native observation never rewrites the clipboard");
  assert.equal(textarea.value, "Before 🌍\nAfter", "copy leaves the note unchanged");
  await clear();

  await mount();
  input.value = "search selection";
  input.setSelectionRange(0, 6);
  clipboardRead = async () => "search";
  await copy(input);
  await advance(0);
  assert.equal(visible(), true, "search input copy uses its own selected value");
  await clear();

  // CodeMirror supplies linewise/multi-range/filter output and prevents default.
  for (const text of ["Filtered whole line 🌍\n", ""]) {
    await mount();
    clipboardRead = async () => text;
    const handled = await copy(textarea, text, true);
    await advance(0);
    assert.equal(visible(), true, "explicit text/plain output wins, including an empty line");
    assert.equal(handled.defaultPrevented, true);
    assert.equal(handled.clipboardData?.getData("text/plain"), text, "payload is untouched");
    await clear();
  }

  await mount();
  const range = window.document.createRange();
  range.selectNodeContents(prose);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  clipboardRead = async () => prose.textContent || "";
  await copy(prose);
  await advance(0);
  assert.equal(visible(), true, "selectable DOM text confirms native readback");
  await clear();

  for (const transient of ["Previous clipboard contents", Error("Read not ready")]) {
    await mount();
    let attempts = 0;
    clipboardRead = async () => {
      if (++attempts === 1) {
        if (transient instanceof Error) throw transient;
        return transient;
      }
      return "Expected source";
    };
    await copy(textarea, "Expected source");
    await advance(0);
    assert.equal(visible(), false, "an early old or rejected readback shows no success");
    assert.equal(attempts, 1);
    await advance(24);
    assert.equal(attempts, 1, "verification waits before retrying the native bridge");
    await advance(1);
    assert.equal(attempts, 2);
    assert.equal(visible(), true, "a later readback confirms the completed native copy");
    await advance(999);
    assert.equal(visible(), true);
    await advance(1);
    assert.equal(visible(), false, "retry success starts its own one-second deadline");
    assert.equal(attempts, 2, "confirmed copies stop retrying");
    await clear();
  }

  for (const read of [
    async () => "Different clipboard contents",
    async () => {
      throw Error("Read failed");
    },
  ]) {
    await mount();
    clipboardRead = read;
    const before = readCount;
    await copy(textarea, "Expected source");
    await advance(50);
    assert.equal(readCount - before, 3, "failed native verification has a bounded three attempts");
    assert.equal(visible(), false, "persistent mismatches and errors never claim success");
    assert.equal(timers.size, 0, "failed verification stops scheduling retries");
    await advance(1000);
    assert.equal(readCount - before, 3, "failed verification remains stopped");
    await clear();
  }
  await mount();
  textarea.setSelectionRange(0, 0);
  const readsBeforeNoop = readCount;
  await copy();
  await copy(textarea, undefined, true);
  await advance(0);
  assert.equal(readCount, readsBeforeNoop, "empty and cancelled native copies are ignored");
  assert.equal(visible(), false);
  await clear();

  for (const replacement of ["native", "explicit"] as const) {
    await mount();
    clipboardRead = async () => "Not yet copied";
    await copy(textarea, "Old source");
    await advance(0);
    const before = readCount;
    await advance(24);
    if (replacement === "native") {
      clipboardRead = async () => "New source";
      await copy(textarea, "New source");
      await advance(0);
    } else {
      await successfulWrite("New source");
    }
    assert.equal(visible(), true, "a newer successful copy replaces delayed verification");
    const expectedReads = before + Number(replacement === "native");
    await advance(1000);
    assert.equal(readCount, expectedReads, "a newer native or explicit copy cancels old retries");
    assert.equal(visible(), false, "cancelled retries cannot extend the replacement toast");
    await clear();
  }

  await mount();
  clipboardRead = async () => "Not yet copied";
  await copy(textarea, "Unmounted retry");
  await advance(0);
  const readsBeforeRetryUnmount = readCount;
  await clear();
  await mount();
  await advance(50);
  assert.equal(readCount, readsBeforeRetryUnmount, "unmount cancels a delayed retry");
  assert.equal(visible(), false, "a replacement instance ignores the abandoned retry");
  await clear();

  await mount();
  const stale = deferred<string>();
  clipboardRead = () => stale.promise;
  await copy(textarea, "Old native copy");
  await advance(0);
  await successfulWrite("New successful copy");
  await advance(900);
  await act(async () => {
    stale.resolve("Old native copy");
  });
  await advance(100);
  assert.equal(visible(), false, "stale native completion cannot extend a newer toast");
  await clear();

  await mount();
  const abandoned = deferred<string>();
  clipboardRead = () => abandoned.promise;
  await copy(textarea, "Abandoned read");
  await advance(0);
  await clear();
  await mount();
  await act(async () => {
    abandoned.resolve("Abandoned read");
  });
  assert.equal(visible(), false, "an old mounted instance cannot notify its replacement");
  await copy(textarea, "Queued read");
  const readsBeforeUnmount = readCount;
  await clear();
  await advance(0);
  assert.equal(readCount, readsBeforeUnmount, "unmount cancels a queued native verification");
  await successfulWrite("No mounted listener");
  assert.equal(timers.size, 0, "unmounted success listeners are removed");
} finally {
  await act(async () => {
    root.unmount();
  });
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  await window.happyDOM.close();
}
console.log(
  "Clipboard toast DOM: confirmed copies, failures, one-second timing, stale reads and cleanup passed",
);
