// Native Wails/WebView2 measurement. Uses only isolated fixture files and profiles.
// Build with build-performance-windows.py; run with Bun: binary output.json.
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const [binary, output] = process.argv.slice(2);
if (process.platform !== "win32" || !binary || !output)
  throw Error("Usage on Windows: bun benchmark-windows.mjs profiling.exe output.json");
try {
  const response = await fetch("http://127.0.0.1:49271/json/version");
  if (response.ok) throw Error("Profiling port 49271 is already occupied");
} catch (error) {
  if (error.message.includes("already occupied")) throw error;
}
const profile = await mkdtemp(join(tmpdir(), "quillpane-native-perf-"));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const startedEpoch = Date.now();
const started = performance.now();
const app = spawn(resolve(binary), [], {
  windowsHide: true,
  env: { ...process.env, APPDATA: profile, LOCALAPPDATA: profile },
  stdio: "ignore",
});
const sockets = [];
let call;
async function until(fn, description) {
  for (let i = 0; i < 300; i++) {
    try {
      const r = await fn();
      if (r) return r;
    } catch {}
    if (app.exitCode !== null) throw Error(`App exited ${app.exitCode}`);
    await pause(100);
  }
  throw Error(description);
}
async function connect(url, events = () => {}) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        clearTimeout(p.timer);
        m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
      }
    } else events(m);
  };
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(Error(`CDP timeout ${method}`));
      }, 30000);
      pending.set(n, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
}
try {
  const version = await until(async () => {
    const r = await fetch("http://127.0.0.1:49271/json/version");
    return r.json();
  }, "WebView2 debugger did not start");
  const targets = await (await fetch("http://127.0.0.1:49271/json/list")).json();
  const browser = await connect(version.webSocketDebuggerUrl);
  const errors = [];
  const requests = [];
  call = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl, (m) => {
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params);
    if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url);
  });
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  await call("Performance.enable");
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await until(
    () => evaluate("!!document.querySelector('#content-area') && !!window.go?.main?.App"),
    "App did not render",
  );
  const readyMs = performance.now() - started;
  await until(
    () => evaluate('performance.getEntriesByName("first-contentful-paint").length > 0'),
    "No contentful paint",
  );
  const paintFromLaunch =
    (await evaluate(
      'performance.timeOrigin + performance.getEntriesByName("first-contentful-paint")[0].startTime',
    )) - startedEpoch;
  async function sample(label) {
    const processes = (await browser("SystemInfo.getProcessInfo")).processInfo;
    const ids = [app.pid, ...processes.map((p) => p.id)];
    const memory = JSON.parse(
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Get-Process -Id ${ids.join(",")} -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`,
        ],
        { windowsHide: true, encoding: "utf8" },
      ),
    );
    const metrics = Object.fromEntries(
      (await call("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
    );
    const result = {
      label,
      metrics,
      processes: memory.map((m) => ({
        ...m,
        type: m.Id === app.pid ? "Go host" : processes.find((p) => p.id === m.Id)?.type,
      })),
      privateBytes: memory.reduce((s, m) => s + m.PrivateMemorySize64, 0),
      workingSetBytes: memory.reduce((s, m) => s + m.WorkingSet64, 0),
      page: await evaluate(
        "({nodes:document.querySelectorAll('*').length,paints:performance.getEntriesByType('paint').map(p=>({name:p.name,ms:p.startTime})),text:document.querySelector('#content-area')?.textContent.slice(0,150)})",
      ),
    };
    console.log(
      label,
      JSON.stringify({
        privateMiB: result.privateBytes / 1048576,
        workingSetMiB: result.workingSetBytes / 1048576,
        heapMiB: metrics.JSHeapUsedSize / 1048576,
        nodes: result.page.nodes,
      }),
    );
    return result;
  }
  await pause(2000);
  const samples = [await sample("blank")];
  const fixtures =
    process.env.QUILLPANE_PERF_STARTUP_ONLY === "1"
      ? []
      : [
          ["small.md", "# A small note\n\nReading a normal note should stay lightweight.\n"],
          ["large.txt", "A line of plain text to read.\n".repeat(80000).slice(0, 2 * 1024 * 1024)],
          [
            "large.md",
            "# Section\n\nA paragraph with **bold** text and a [local link](#section).\n\n".repeat(
              14000,
            ),
          ],
        ];
  if (process.env.QUILLPANE_PERF_STARTUP_ONLY !== "1")
    fixtures.push([
      "diagram.md",
      "# Diagram check\n\n```mermaid\nflowchart LR\nA[Start] --> B[Finish]\n```\n",
    ]);
  const workloads = [];
  for (const [name, text] of fixtures) {
    const path = join(profile, name);
    await writeFile(path, text);
    const start = performance.now();
    await evaluate(
      `window.go.main.App.OpenDroppedFile(${JSON.stringify(path)}).then(()=>{window.runtime.EventsEmit('secondInstance')})`,
    );
    await until(
      () =>
        evaluate(
          name === "large.txt"
            ? `document.querySelector('.plain-text-view')?.textContent.length === ${text.length}`
            : name === "large.md"
              ? "document.querySelectorAll('#viewer h1').length === 14000"
              : name === "diagram.md"
                ? "!!document.querySelector('.mermaid svg')"
                : "document.querySelector('#viewer h1')?.textContent === 'A small note'",
        ),
      "Fixture did not open",
    );
    await evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    workloads.push({
      name,
      bytes: Buffer.byteLength(text),
      observedReadyMs: performance.now() - start,
    });
    await pause(1500);
    samples.push(await sample(name));
    await call("HeapProfiler.collectGarbage");
    samples.push(await sample(name + "-gc"));
    if (name === "large.txt") {
      const scrollHeightBefore = await evaluate(
        "document.querySelector('#viewer-container').scrollHeight",
      );
      await evaluate(
        "document.querySelector('#viewer-container').scrollTop = document.querySelector('#viewer-container').scrollHeight",
      );
      await pause(150);
      const scrollHeightAfter = await evaluate(
        "document.querySelector('#viewer-container').scrollHeight",
      );
      workloads.at(-1).scrollHeightChange =
        (scrollHeightAfter - scrollHeightBefore) / scrollHeightBefore;
      if (Math.abs(workloads.at(-1).scrollHeightChange) > 0.01)
        throw Error("Plain-text scroll extent changed by more than 1%");
      await evaluate("document.querySelector('#viewer-container').scrollTop = 0");
      const selected = await evaluate(
        '(() => { const pre=document.querySelector(".plain-text-view");const range=document.createRange();range.selectNodeContents(pre);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);const value=selection.toString();selection.removeAllRanges();return value;})()',
      );
      workloads.at(-1).selectionMatches = selected === text;
      if (selected !== text) throw Error("Full text selection changed the document");
    }
    if (name === "diagram.md") {
      await until(
        () => evaluate('!!document.querySelector(".mermaid svg")'),
        "Mermaid did not render",
      );
      workloads.at(-1).diagramRendered = true;
    }
    await call("Page.captureScreenshot", { format: "png" }).then((r) =>
      writeFile(join(profile, name + ".png"), Buffer.from(r.data, "base64")),
    );
  }
  const smoke = {};
  if (fixtures.length) {
    const path = join(profile, "small.md");
    const original = fixtures[0][1];
    await evaluate(
      `window.go.main.App.OpenDroppedFile(${JSON.stringify(path)}).then(()=>window.runtime.EventsEmit('secondInstance'))`,
    );
    await until(
      () => evaluate("document.querySelector('#viewer h1')?.textContent === 'A small note'"),
      "Small note did not reopen",
    );
    await evaluate("window.runtime.EventsEmit('menu:vieweditor')");
    await until(
      () => evaluate("!!document.querySelector('textarea#editor')"),
      "Editor did not open",
    );
    await evaluate(
      "(()=>{const input=document.querySelector('#editor');input.focus();input.setSelectionRange(input.value.length,input.value.length)})()",
    );
    await call("Input.insertText", { text: "Native edit check." });
    const edited = original + "Native edit check.";
    await until(
      () =>
        evaluate(
          `window.go.main.App.GetActiveContent().then(value => value === ${JSON.stringify(edited)})`,
        ),
      "Draft did not persist",
    );
    smoke.draftPersisted = true;
    await evaluate("window.runtime.EventsEmit('menu:undo')");
    await until(
      () => evaluate(`document.querySelector('#editor').value === ${JSON.stringify(original)}`),
      "Undo failed",
    );
    await evaluate("window.runtime.EventsEmit('menu:redo')");
    await until(
      () => evaluate(`document.querySelector('#editor').value === ${JSON.stringify(edited)}`),
      "Redo failed",
    );
    smoke.undoRedo = true;
    await evaluate("window.runtime.EventsEmit('menu:save')");
    await until(async () => (await readFile(path, "utf8")) === edited, "Save did not reach disk");
    smoke.savedExactly = true;
    await writeFile(path, "External fixture modification.");
    await call("Input.insertText", { text: " Unsaved change." });
    await evaluate("window.runtime.EventsEmit('menu:save')");
    await until(
      () => evaluate("!!document.querySelector('.save-conflict-card')"),
      "External change was not protected",
    );
    if ((await readFile(path, "utf8")) !== "External fixture modification.")
      throw Error("External content overwritten");
    smoke.externalConflictProtected = true;
    await evaluate("document.querySelector('.save-conflict-card button').click()");
  }
  await writeFile(
    output,
    JSON.stringify(
      {
        version,
        profile,
        readyMs,
        paintFromLaunch,
        binary: resolve(binary),
        workloads,
        smoke,
        samples,
        errors,
        requests,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw Error(`${errors.length} runtime exceptions`);
  console.log("Profile:", profile);
} finally {
  try {
    await call?.("Runtime.evaluate", { expression: "window.go.main.App.QuitWithoutSaving()" });
  } catch {}
  for (const s of sockets) s.close();
  app.kill();
}
