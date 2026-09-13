// Capture genuine product screenshots from the native Windows WebView using public fixtures.
// Build with build-performance-windows.py; run with Bun: binary output-prefix.
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const [binary, output] = process.argv.slice(2);
if (process.platform !== "win32" || !binary || !output)
  throw Error("Usage on Windows: bun capture-product-windows.mjs profiling.exe output-prefix");
try {
  const response = await fetch("http://127.0.0.1:49271/json/version");
  if (response.ok) throw Error("Profiling port 49271 is already occupied");
} catch (error) {
  if (error.message.includes("already occupied")) throw error;
}
const profile = await mkdtemp(join(tmpdir(), "quillpane-native-perf-"));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const targets = await until(async () => {
    const list = await (await fetch("http://127.0.0.1:49271/json/list")).json();
    return list.some((target) => target.type === "page") && list;
  }, "Native WebView did not start");
  call = await connect(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await until(() => evaluate("!!window.go?.main?.App && !!document.querySelector('#content-area')"), "App did not render");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate("localStorage.setItem('markpad-preferences-v1',JSON.stringify({version:1,themeMode:'light',palette:'markpad',uiScale:1,textSize:14,lineSpacing:'comfortable',readingWidth:'balanced',reducedMotion:true}))");
  await call("Page.reload");
  await until(() => evaluate("!!window.go?.main?.App && !!document.querySelector('#content-area')"), "App did not reload");
  const open = async (name, mode) => {
    const path = join(profile, name);
    await copyFile(resolve("docs/examples", name), path);
    await evaluate(`(async()=>{await window.go.main.App.OpenDroppedFile(${JSON.stringify(path)});const s=await window.go.main.App.GetSession();${mode ? `await window.go.main.App.SetViewMode(s.activeId,${JSON.stringify(mode)});` : ""}window.runtime.EventsEmit('secondInstance');})()`);
    await pause(450);
  };
  const capture = async (name) => {
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1430, y: 895 });
    await pause(250);
    const shot = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(output + "-" + name + ".png"), Buffer.from(shot.data, "base64"));
    console.log("Captured", name);
  };
  const click = async (selector) => {
    await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), "Missing " + selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await pause(200);
  };
  const taskView = async (name) => {
    await evaluate(`[...document.querySelectorAll('.task-document button')].find(b=>b.textContent.trim()===${JSON.stringify(name)}).click()`);
    await pause(200);
  };
  await open("This-week.md");
  await open("Writing.ts", "viewer");
  await open("Reading-notes.md", "split");
  // Remove only the empty starter draft inside this disposable profile.
  await evaluate("(async()=>{const s=await window.go.main.App.GetSession();for(const n of s.notes){if(!n.path&&(await window.go.main.App.GetNoteContent(n.id)).trim()==='')await window.go.main.App.DiscardNote(n.id);}window.runtime.EventsEmit('secondInstance');})()");
  await pause(300);
  await capture("split");
  await open("Writing.ts", "viewer");
  await capture("code");
  await open("Reading-notes.md", "viewer");
  await capture("notes");
  await evaluate("[...document.querySelectorAll('.app-titlebar-actions button')].find(b=>b.textContent.includes('Settings')).click()");
  await pause(200);
  await capture("settings");
  await click('[aria-label="Close settings"]');
  await open("This-week.md");
  await until(() => evaluate("!!document.querySelector('.task-document')"), "Task board did not open");
  await taskView("Board");
  await capture("tasks-board");
  await taskView("List");
  await capture("tasks-list");
  await taskView("Calendar");
  await capture("tasks-calendar");
  await taskView("Board");
  await evaluate("document.documentElement.dataset.appearance='dark';document.documentElement.style.colorScheme='dark'");
  await capture("tasks-dark");
  await writeFile(resolve(output + "-provenance.json"), JSON.stringify({ version: "0.14.1", renderer: "native Windows WebView2", viewport: [1440,900], fixtures: "docs/examples", profile }, null, 2));
} finally {
  try { await call?.("Runtime.evaluate", { expression: "window.go.main.App.QuitWithoutSaving()" }); } catch {}
  for (const socket of sockets) socket.close();
  app.kill();
}
