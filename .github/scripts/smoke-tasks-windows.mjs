// Native task interaction and scaling checks, using only isolated fixtures/profiles.
// Build with build-performance-windows.py; run with Bun: binary output.json.
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const [binary, output] = process.argv.slice(2);
if (process.platform !== "win32" || !binary || !output)
  throw Error("Usage on Windows: bun smoke-tasks-windows.mjs profiling.exe output.json");
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
  const checks = [];
  const samples = [];
  const assert = async (expression, description) => {
    try {
      await until(() => evaluate(expression), description);
      checks.push(description);
    } catch (e) {
      console.log(
        await evaluate(
          "({text:document.querySelector('.task-document')?.textContent,source:window.go.main.App.GetActiveContent()})",
        ),
      );
      console.log(await source());
      await screenshot("failure");
      throw e;
    }
  };
  const click = async (selector) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await pause(90);
  };
  const button = async (text) => {
    if (
      text === "Categories" &&
      (await evaluate("!!document.querySelector('.task-manager-dialog[open]')"))
    ) {
      await click('[aria-label="Close categories and tags"]');
      return;
    }
    if (
      text === "Move completed to Trash…" &&
      !(await evaluate("!!document.querySelector('.task-popup')"))
    )
      await click('[aria-label="Board actions"]');
    await until(
      () =>
        evaluate(
          `[...document.querySelectorAll('.task-document button')].some(b=>b.textContent.trim()===${JSON.stringify(text)})`,
        ),
      `Missing task button: ${text}`,
    );
    await evaluate(
      `[...document.querySelectorAll('.task-document button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`,
    );
    await pause(90);
  };
  const fill = async (selector, value) => {
    if (
      selector.includes("Filter tasks") &&
      !(await evaluate("!!document.querySelector('[aria-label=\"Filter tasks\"]')"))
    )
      await click('[aria-label="Search tasks"]');
    if (selector.includes("New task tags") || selector.includes("Tags for ")) {
      await click(selector);
      for (let i = 0; i < 8; i++) {
        if (
          !(await evaluate("!!document.querySelector('.task-popup .task-pill[aria-pressed=true]')"))
        )
          break;
        await click(".task-popup .task-pill[aria-pressed=true]");
      }
      for (const name of value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)) {
        await fill('[aria-label="Find or create tag"]', name);
        await call("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
        await call("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
        await pause(90);
      }
      await evaluate(
        "[...document.querySelectorAll('.task-popup button')].find(b=>b.textContent==='Done').click()",
      );
      await pause(90);
      return;
    }
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select();})()`,
    );
    if (selector.includes("Filter tasks")) {
      await evaluate(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    } else {
      await call("Input.insertText", { text: value });
    }
    await pause(60);
  };
  const select = async (selector, value) => {
    if (selector.includes("Category for ")) {
      if (!(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`))) {
        const title = selector.match(/Category for (.*)"/)[1];
        await evaluate(
          `[...document.querySelectorAll('[data-task-title]')].find(e=>e.dataset.taskTitle===${JSON.stringify(title)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:300}))`,
        );
        await pause(90);
        await evaluate(
          "[...document.querySelectorAll('.task-popup button')].find(e=>e.textContent==='Move to category…').click()",
        );
        await pause(90);
        await evaluate(
          `[...document.querySelectorAll('.task-popup button')].find(e=>e.textContent===${JSON.stringify(value || "No category")}).click()`,
        );
        await pause(90);
        return;
      }
      await click(selector);
      await evaluate(
        `[...document.querySelectorAll('.task-popup [role="option"]')].find(b=>b.dataset.value===${JSON.stringify(value)}).click()`,
      );
      await pause(90);
      return;
    }
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await pause(90);
  };
  const source = () => evaluate("window.go.main.App.GetActiveContent()");
  const screenshot = async (name) => {
    await pause(180);
    const r = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(output + "-" + name + ".png"), Buffer.from(r.data, "base64"));
  };
  const open = async (path) => {
    await evaluate(
      `window.go.main.App.OpenDroppedFile(${JSON.stringify(path)}).then(()=>window.runtime.EventsEmit('secondInstance'))`,
    );
    await pause(300);
  };
  await pause(800);
  await click('[aria-label="Choose new file type"]');
  await evaluate(
    "[...document.querySelectorAll('[role=menuitem]')].find(b=>b.textContent.includes('Task board')).click()",
  );
  await assert("!!document.querySelector('.task-document')", "New Task board opens its task view");
  await assert(
    "window.go.main.App.GetActiveContent().then(s=>s.startsWith('<!-- quillpane:tasks -->'))",
    "New task file contains the Markdown marker",
  );
  const fixture = join(profile, "Weekend plans.md");
  await assert(
    "!!document.querySelector('.file-kind-tasks svg') && document.querySelector('.document-title').textContent.trim()==='Tasks'",
    "New task file has a distinct icon and useful title",
  );
  await assert(
    "window.go.main.App.GetSession().then(s=>s.notes.find(n=>n.id===s.activeId).taskBoard===true)",
    "Task identity reaches native session metadata",
  );
  await writeFile(fixture, "<!-- quillpane:tasks -->\n# A little more organized\n\n");
  await open(fixture);
  await assert(
    "document.querySelector('.task-header h1')?.textContent==='A little more organized'",
    "Saved task file reopens as tasks",
  );
  await button("Categories");
  for (const name of ["Work", "Personal", "Ideas"]) {
    await fill('[aria-label="New category"]', name);
    await button("Add category");
  }
  await button("Categories");
  for (const [title, category] of [
    ["Plan the week", ""],
    ["Review the Quillpane task view", "Work"],
    ["Keep categories simple", "Work"],
    ["Take a walk after lunch", "Personal"],
    ["Try a calmer reading theme", "Ideas"],
    [
      "A long task title should wrap naturally without pushing the controls outside the window",
      "Personal",
    ],
  ]) {
    await fill('[aria-label="New task"]', title);
    await select('[aria-label="New task category"]', category);
    await button("Add task");
  }
  await assert(
    "document.querySelectorAll('.task-card').length===6",
    "Creates tagged and untagged tasks",
  );
  await click('[data-task-title="Keep categories simple"] input[type=checkbox]');
  await assert(
    "document.querySelector('[aria-label=\"Category for Keep categories simple\"]').dataset.value==='Work'",
    "Completion keeps the category",
  );
  await screenshot("list-light");
  await evaluate(
    "document.querySelector('[data-task-title=\"Keep categories simple\"] input').focus()",
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "z",
    code: "KeyZ",
    windowsVirtualKeyCode: 90,
    modifiers: 2,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "z",
    code: "KeyZ",
    windowsVirtualKeyCode: 90,
    modifiers: 2,
  });
  await assert(
    "document.querySelector('[data-task-title=\"Keep categories simple\"] input').checked===false",
    "Checkbox focus still allows document undo",
  );
  await evaluate("window.runtime.EventsEmit('menu:redo')");
  await assert(
    "document.querySelector('[data-task-title=\"Keep categories simple\"] input').checked===true",
    "Completion can be redone after keyboard undo",
  );
  await button("Board");
  await assert(
    "document.querySelectorAll('.task-column').length===4",
    "Board shows Untagged and each category",
  );
  await select('[aria-label="Category for Plan the week"]', "Personal");
  await assert(
    "!!document.querySelector('.task-column[aria-label=Personal] [data-task-title=\"Plan the week\"]')",
    "Category picker moves a card to its column",
  );
  await evaluate(
    "(()=>{const e=document.querySelector('[data-task-title=\"Plan the week\"]');window.taskDrag=new DataTransfer();e.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.taskDrag}));})()",
  );
  await pause(80);
  await evaluate(
    "document.querySelector('.task-column[aria-label=Untagged]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:window.taskDrag}))",
  );
  await assert(
    "!!document.querySelector('.task-column[aria-label=Untagged] [data-task-title=\"Plan the week\"]')",
    "Drag and drop changes category",
  );
  await click('[aria-label="Move Plan the week to Trash"]');
  await click(".task-trash-button");
  await assert(
    "document.querySelectorAll('.task-card').length===1",
    "Trash displays removed tasks",
  );
  await button("Restore");
  await button("Back to tasks");
  await assert("document.querySelectorAll('.task-card').length===6", "Restore returns the task");
  await click('[aria-label="Move Plan the week to Trash"]');
  await click(".task-trash-button");
  await button("Empty Trash…");
  await screenshot("trash-confirm");
  await button("Cancel");
  await assert(
    "document.querySelectorAll('.task-card').length===1",
    "Cancel empty Trash preserves tasks",
  );
  await button("Empty Trash…");
  await button("Empty Trash");
  await assert(
    "document.querySelectorAll('.task-card').length===0",
    "Confirmed empty Trash clears removed tasks",
  );
  await pause(500);
  await evaluate("window.runtime.EventsEmit('menu:undo')");
  await assert(
    "document.querySelectorAll('.task-card').length===1",
    "Document undo recovers emptied Trash",
  );
  await assert(
    "window.go.main.App.GetActiveContent().then(s=>s.includes('- [ ] Plan the week'))",
    "Undo also updates the recovery draft",
  );
  await evaluate("window.runtime.EventsEmit('menu:redo')");
  await assert("document.querySelectorAll('.task-card').length===0", "Redo clears Trash again");
  await evaluate("window.runtime.EventsEmit('menu:undo')");
  await assert(
    "document.querySelectorAll('.task-card').length===1",
    "Undo remains usable after redo",
  );
  await button("Restore");
  await button("Back to tasks");
  await click('[data-task-title="Plan the week"] .task-quiet');
  await assert(
    "document.activeElement===document.querySelector('.task-edit input')",
    "Edit focuses the task title",
  );
  await fill(".task-edit input", "Plan a calmer week");
  await button("Save task");
  await assert(
    "!!document.querySelector('[data-task-title=\"Plan a calmer week\"]')",
    "Edit changes the task title",
  );
  await button("Categories");
  await fill('[aria-label="Rename category Ideas"]', "Later");
  await evaluate(
    "document.querySelector('[aria-label=\"Rename category Ideas\"]').closest('form').requestSubmit()",
  );
  await assert(
    "!!document.querySelector('.task-column[aria-label=Later]')",
    "Rename changes the category column",
  );
  await evaluate(
    "[...document.querySelector('[aria-label=\"Rename category Later\"]').closest('form').querySelectorAll('button')].find(b=>b.textContent.includes('Remove')).click()",
  );
  await pause(80);
  await button("Remove category");
  await assert(
    "document.querySelectorAll('.task-column').length===3 && document.querySelector('.task-column[aria-label=Untagged] [data-task-title=\"Try a calmer reading theme\"]')!==null",
    "Removing a category keeps its tasks in Untagged",
  );
  await button("Categories");
  await click('[data-task-title="Keep categories simple"] .task-quiet');
  await button("Move up");
  await assert(
    "document.querySelector('.task-column[aria-label=Work] .task-card')?.dataset.taskTitle==='Keep categories simple'",
    "Keyboard alternative reorders a task",
  );
  await fill('[aria-label="New task"]', "Keep this unsubmitted text");
  await evaluate("window.runtime.EventsEmit('menu:preferences')");
  await pause(180);
  await evaluate(
    "[...document.querySelectorAll('.settings-panel button')].find(b=>b.textContent.trim()==='Dark')?.click()",
  );
  await pause(120);
  await assert(
    "document.documentElement.dataset.appearance==='dark'",
    "Appearance settings apply to the task view",
  );
  await click("#reduced-motion");
  await assert(
    "parseFloat(getComputedStyle(document.querySelector('.task-view-switch button')).transitionDuration)===0",
    "Reduced motion removes task control transitions",
  );
  await evaluate("document.querySelector('[aria-label=\"Close settings\"]')?.click()");
  await assert(
    "document.querySelector('[aria-label=\"New task\"]').value==='Keep this unsubmitted text'",
    "Theme changes preserve the task composer",
  );
  await fill('[aria-label="New task"]', "");
  await pause(450);
  const beforeInputUndo = await source();
  await fill('[aria-label="New task"]', "A temporary idea");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "z",
    code: "KeyZ",
    windowsVirtualKeyCode: 90,
    modifiers: 2,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "z",
    code: "KeyZ",
    windowsVirtualKeyCode: 90,
    modifiers: 2,
  });
  await assert(
    "document.querySelector('[aria-label=\"New task\"]').value===''",
    "Input undo stays local to the task composer",
  );
  await pause(400);
  if ((await source()) !== beforeInputUndo) throw Error("Input undo changed the task file");
  checks.push("Input undo preserves committed task changes");
  await evaluate("window.runtime.EventsEmit('menu:save')");
  await pause(650);
  const saved = await readFile(fixture, "utf8");
  if (
    !saved.includes("- [x] Keep categories simple <!-- category: Work -->") ||
    !saved.includes("- [ ] Plan a calmer week")
  )
    throw Error("Saved Markdown missing task changes");
  checks.push("Native Save writes task changes as ordinary Markdown");
  await evaluate("window.runtime.EventsEmit('menu:vieweditor')");
  await assert(
    "document.querySelector('textarea')?.value.includes('- [ ] Plan a calmer week')",
    "Editor shows the same Markdown source",
  );
  await evaluate("window.runtime.EventsEmit('menu:viewpreview')");
  await assert(
    "document.querySelectorAll('.task-card').length===6",
    "Preview returns to the same tasks",
  );
  await evaluate(
    "document.documentElement.dataset.appearance='light';document.documentElement.style.colorScheme='light'",
  );
  await screenshot("board-light");
  const selectedSelector = '.task-view-switch button[aria-pressed="true"]';
  const selectedPaint = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selectedSelector)}),s=getComputedStyle(e),r=e.getBoundingClientRect();return {background:s.backgroundColor,color:s.color,width:r.width,height:r.height,x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: selectedPaint.x,
    y: selectedPaint.y,
  });
  await pause(200);
  await assert(
    `(()=>{const e=document.querySelector(${JSON.stringify(selectedSelector)}),s=getComputedStyle(e),r=e.getBoundingClientRect();return e.matches(':hover')&&s.backgroundColor===${JSON.stringify(selectedPaint.background)}&&s.color===${JSON.stringify(selectedPaint.color)}&&r.width===${selectedPaint.width}&&r.height===${selectedPaint.height}})()`,
    "Selected view keeps its paint and geometry under pointer hover",
  );
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
  await assert(
    "[...document.querySelectorAll('.task-card-actions > .task-quiet,.task-card-actions > .task-icon-button')].every(b=>Number(getComputedStyle(b).opacity)===0)",
    "Edit and Trash actions are hidden while cards are idle",
  );
  const cardPoint = await evaluate(
    "(()=>{const r=document.querySelector('.task-card').getBoundingClientRect();return {x:r.x+12,y:r.y+12}})()",
  );
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...cardPoint });
  await assert(
    "[...document.querySelector('.task-card').querySelectorAll('.task-card-actions > button')].every(b=>getComputedStyle(b).opacity==='1'&&getComputedStyle(b).pointerEvents==='auto')",
    "Hover reveals usable Edit and Trash actions",
  );
  await screenshot("card-hover");
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
  await evaluate("document.querySelector('.task-card-actions > button').focus()");
  await assert(
    "[...document.querySelector('.task-card').querySelectorAll('.task-card-actions > button')].every(b=>getComputedStyle(b).opacity==='1')",
    "Keyboard focus reveals card actions without pointer hover",
  );
  await evaluate("document.activeElement.blur()");
  await assert(
    "(()=>{const b=document.querySelector('.task-add button'),s=getComputedStyle(b);return b.disabled&&s.backgroundColor===getComputedStyle(document.querySelector('.task-column')).backgroundColor&&Number(s.opacity)===1})()",
    "Disabled composer action retains a readable label",
  );
  await assert(
    "(()=>{const columns=[...document.querySelectorAll('.task-column')];return columns.length===3&&columns.at(-1).getBoundingClientRect().right<=document.querySelector('.task-columns').getBoundingClientRect().right+1})()",
    "Three board columns fit the desktop pane",
  );
  await click('[aria-label="Add task to Personal"]');
  await assert(
    "document.activeElement===document.querySelector('[aria-label=\"New task\"]') && document.querySelector('[aria-label=\"New task category\"]').value==='Personal'",
    "Column quick-add selects its category and focuses the composer",
  );
  const paletteContrast = await evaluate(`(async()=>{
    const root=document.documentElement, initial={palette:root.dataset.palette,appearance:root.dataset.appearance};
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
    const rgb=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=getComputedStyle(root).getPropertyValue('--mp-paper');ctx.fillRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)};
    const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const results=[];
    for(const palette of ['markpad','graphite','nord','solarized','rose','contrast'])for(const mode of ['light','dark']){
      root.dataset.palette=palette;root.dataset.appearance=mode;root.style.colorScheme=mode;getComputedStyle(root).getPropertyValue("--mp-paper");await new Promise(r=>setTimeout(r,250));
      for(const tag of document.querySelectorAll('.task-stage')){
        const style=getComputedStyle(tag),fg=rgb(style.color),bg=rgb(style.backgroundColor),border=rgb(style.borderTopColor);
        const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        results.push({palette,mode,tone:tag.dataset.value,fg,bg,ratio,softBorder:border.some((v,i)=>Math.abs(v-fg[i])>15)});
      }
      for(const selector of ['.task-view-switch button[aria-pressed=true]', '.task-add button:disabled', '.task-card-actions > button']){
        const style=getComputedStyle(document.querySelector(selector)),fg=rgb(style.color),bg=rgb(style.backgroundColor),a=lum(fg),b=lum(bg);
        results.push({palette,mode,tone:selector,fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),softBorder:true});
      }
    }
    root.dataset.palette=initial.palette;root.dataset.appearance=initial.appearance;root.style.colorScheme=initial.appearance;return results;
  })()`);
  if (paletteContrast.some((r) => r.ratio < 4.5 || !r.softBorder))
    throw Error(
      "Category contrast or generated border regression: " + JSON.stringify(paletteContrast),
    );
  checks.push(
    "Rendered category tags have readable text and soft borders across all twelve theme modes",
  );
  await evaluate(
    "document.documentElement.dataset.appearance='dark';document.documentElement.style.colorScheme='dark'",
  );
  await screenshot("board-dark");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate("window.runtime.EventsEmit('menu:zoomin')");
  await screenshot("board-narrow");
  await assert(
    "document.documentElement.scrollWidth<=innerWidth",
    "Narrow board does not widen the app",
  );
  await button("List");
  await screenshot("list-narrow");
  await assert(
    "document.documentElement.scrollWidth<=innerWidth",
    "Narrow list does not widen the app",
  );
  await call("Emulation.clearDeviceMetricsOverride");
  await call("HeapProfiler.collectGarbage");
  samples.push(await sample("six-tasks-gc"));
  const large = join(profile, "500 tasks.md");
  await writeFile(
    large,
    '<!-- quillpane:tasks -->\n<!-- quillpane:categories ["Work","Personal","Ideas"] -->\n# A full task list\n\n' +
      Array.from(
        { length: 500 },
        (_, i) =>
          `- [${i % 5 === 0 ? "x" : " "}] Task ${i + 1}: Keep the list comfortable to scan${i % 4 === 0 ? "" : ` <!-- category: ${["Work", "Personal", "Ideas"][i % 3]} -->`}\n`,
      ).join(""),
  );
  const largeStart = performance.now();
  await evaluate(
    `window.go.main.App.OpenDroppedFile(${JSON.stringify(large)}).then(()=>window.runtime.EventsEmit('secondInstance'))`,
  );
  await assert(
    "document.querySelectorAll('.task-card').length===500",
    "All 500 tasks are available",
  );
  const largeReadyMs = performance.now() - largeStart;
  await call("HeapProfiler.collectGarbage");
  samples.push(await sample("500-tasks-gc"));
  await fill('[aria-label="Filter tasks"]', "Task 500:");
  await assert(
    "document.querySelectorAll('.task-card').length===1",
    "Large task list filtering works",
  );
  await fill('[aria-label="Filter tasks"]', "");
  await button("Board");
  await assert("document.querySelectorAll('.task-card').length===500", "Board handles 500 tasks");
  await call("HeapProfiler.collectGarbage");
  samples.push(await sample("500-task-board-gc"));
  const oversized = join(profile, "501 tasks.md");
  await writeFile(
    oversized,
    "<!-- quillpane:tasks -->\n# Large file\n\n" + "- [ ] Task\n".repeat(501),
  );
  await open(oversized);
  await assert(
    "!!document.querySelector('.task-unavailable')",
    "Oversized task files show an explicit bounded fallback",
  );
  await evaluate("window.runtime.EventsEmit('menu:vieweditor')");
  await assert(
    "document.querySelector('textarea')?.value.split('- [ ] Task').length===502",
    "The full oversized file stays available in Editor",
  );
  await evaluate("document.querySelector('[aria-label=\"Maximize window\"]').click()");
  await assert("window.runtime.WindowIsMaximised()", "Window maximizes through its titlebar");
  await until(
    () => evaluate("!!document.querySelector('[aria-label=\"Restore window\"]')"),
    "Restore control did not update",
  );
  await evaluate("document.querySelector('[aria-label=\"Restore window\"]').click()");
  await assert(
    "window.runtime.WindowIsMaximised().then(v=>!v)",
    "Window restores through its titlebar",
  );
  await evaluate(
    "document.querySelector('.app-titlebar').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))",
  );
  await assert("window.runtime.WindowIsMaximised()", "Titlebar double-click maximizes");
  await evaluate(
    "document.querySelector('.app-titlebar').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))",
  );
  await assert("window.runtime.WindowIsMaximised().then(v=>!v)", "Titlebar double-click restores");
  await evaluate("document.querySelector('[aria-label=\"Minimize window\"]').click()");
  await pause(150);
  await evaluate("window.runtime.WindowUnminimise()");
  await assert(
    "!!document.querySelector('#content-area')",
    "Content remains available after minimize and restore",
  );
  await evaluate("document.querySelector('[aria-label=\"Close window\"]').click()");
  await assert(
    "!!document.querySelector('#quit-dialog-title')",
    "Close protects unsaved task drafts",
  );
  await evaluate(
    "[...document.querySelectorAll('[role=alertdialog] button')].find(b=>b.textContent.trim()==='Cancel').click()",
  );
  await assert(
    "!document.querySelector('#quit-dialog-title') && document.querySelector('textarea')?.value.split('- [ ] Task').length===502",
    "Cancel close keeps the complete active document",
  );
  const finishedFixture = join(profile, "Finish tasks.md");
  await writeFile(
    finishedFixture,
    '<!-- quillpane:tasks -->\n<!-- quillpane:categories ["Work","Personal"] -->\n# Finish tasks\n\n- [ ] A\n  Attached alpha note\n\n- [ ] B <!-- category: Work -->\n- [x] C <!-- category: Personal -->\n  Preserve completed notes\n\n## Trash\n\n- [ ] Earlier <!-- category: Work -->\n',
  );
  await open(finishedFixture);
  await button("List");
  await click('[aria-label="Edit A"]');
  await button("Move down");
  await assert(
    "[...document.querySelectorAll('.task-card')].map(e=>e.dataset.taskTitle).join(',')==='B,A,C' && document.querySelector('[aria-label=\"Category for A\"]').dataset.value==='' && document.querySelector('[aria-label=\"Category for B\"]').dataset.value==='Work'",
    "List reordering follows visible rows without changing categories",
  );
  await fill('[aria-label="Filter tasks"]', "Attached alpha");
  await assert(
    "document.querySelectorAll('.task-card').length===1 && document.querySelector('.task-card').dataset.taskTitle==='A'",
    "Search includes attached notes",
  );
  await button("Clear filters");
  await button("Categories");
  await click('[aria-label="Move category Personal earlier"]');
  await button("Categories");
  await button("Board");
  await assert(
    "[...document.querySelectorAll('.task-column')].map(e=>e.getAttribute('aria-label')).join(',')==='Untagged,Personal,Work'",
    "Category order updates the board",
  );
  await select('[aria-label="Task completion filter"]', "open");
  await button("Move completed to Trash…");
  await assert(
    "document.querySelector('[aria-label=\"Confirm move completed tasks\"]').textContent.includes('including hidden tasks')",
    "Bulk cleanup clearly includes filtered-out completed tasks",
  );
  await button("Cancel");
  await button("Clear filters");
  await assert(
    "!!document.querySelector('[data-task-title=C]')",
    "Cancel cleanup keeps completed tasks",
  );
  await button("Move completed to Trash…");
  await button("Move completed");
  await assert(
    "!document.querySelector('[data-task-title=C]')",
    "Completed tasks move into recoverable Trash",
  );
  await click(".task-trash-button");
  await assert(
    "document.querySelectorAll('.task-card').length===2",
    "Cleanup preserves existing Trash",
  );
  await button("Restore all");
  await assert(
    "document.querySelectorAll('.task-card').length===0",
    "Restore all empties task Trash without deletion",
  );
  await button("Back to tasks");
  await assert(
    "document.querySelectorAll('.task-card').length===4 && document.querySelector('[data-task-title=C] .task-description').textContent==='Preserve completed notes'",
    "Bulk restore keeps completion, category and attached notes",
  );
  await select('[aria-label="Task completion filter"]', "done");
  await fill('[aria-label="Filter tasks"]', "No match");
  await fill('[aria-label="New task"]', "New and visible");
  await button("Add task");
  await assert(
    "!!document.querySelector('[data-task-title=\"New and visible\"]') && document.querySelector('[aria-label=\"Filter tasks\"]').value==='' && document.querySelector('[aria-label=\"Task completion filter\"]').value==='all'",
    "New tasks remain visible after adding through filters",
  );
  await click('[aria-label="Edit A"]');
  await button("Edit source");
  await assert(
    "document.activeElement===document.querySelector('textarea') && document.querySelector('textarea').value.slice(document.querySelector('textarea').selectionStart).startsWith('- [ ] A')",
    "Edit notes opens the full Editor at the exact task line",
  );
  await evaluate("window.runtime.EventsEmit('menu:viewpreview')");
  await assert(
    "!!document.querySelector('.task-document')",
    "Returning from source restores task view",
  );
  await click('[aria-label="Edit A"]');
  await fill(".task-edit input", "A renamed");
  await evaluate("document.querySelector('[aria-label=\"New task\"]').focus()");
  await assert(
    "!!document.querySelector('[data-task-title=\"A renamed\"]')",
    "Leaving a title edit retains valid text in the recovery pipeline",
  );
  await click('[aria-label="Edit A renamed"]');
  await fill(".task-edit input", "Should cancel");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await assert(
    "!!document.querySelector('[data-task-title=\"A renamed\"]') && !document.querySelector('.task-edit') && !document.querySelector('[data-task-title=\"Should cancel\"]')",
    "Escape cancels an inline title edit",
  );
  await click('[aria-label="Edit board title in Editor"]');
  await assert(
    "document.querySelector('textarea').value.slice(document.querySelector('textarea').selectionStart).startsWith('# Finish tasks')",
    "Board title action targets its Markdown heading",
  );
  await evaluate("window.runtime.EventsEmit('menu:save')");
  await assert(
    "window.go.main.App.GetSession().then(s=>!s.notes.find(n=>n.id===s.activeId).dirty)",
    "Finished workflow saves cleanly",
  );
  const finishedSaved = await readFile(finishedFixture, "utf8");
  if (
    !finishedSaved.includes('["Personal","Work"]') ||
    !finishedSaved.includes("Attached alpha note") ||
    !finishedSaved.includes("New and visible")
  )
    throw Error("Finished task workflow did not persist exactly");
  checks.push("Category order, task notes and additions persist to Markdown");
  await evaluate("window.runtime.EventsEmit('menu:viewpreview')");
  await button("Board");
  await screenshot("finished-board");
  await button("List");
  await screenshot("finished-list");
  const workflowFixture = join(profile, "My workflow.md");
  await writeFile(
    workflowFixture,
    '<!-- quillpane:tasks -->\n<!-- quillpane:workflow -->\n<!-- quillpane:categories ["Backlog","To do","Today","Done"] -->\n# My workflow\n\n- [ ] Plan a calmer week <!-- tags: ["Personal"] --> <!-- category: Backlog -->\n- [ ] Review the design <!-- tags: ["Work","Design"] --> <!-- category: Today -->\n  Keep the interface quiet.\n- [x] Keep notes portable <!-- tags: ["Work"] --> <!-- category: Done -->\n',
  );
  await open(workflowFixture);
  await button("Board");
  await assert(
    "document.querySelectorAll('.task-column').length===4&&!document.querySelector('.task-add')",
    "Workflow boards have four stages without a permanent composer",
  );
  await click('[aria-label="Collapse Done"]');
  await assert(
    "document.querySelector('[aria-label=Done]').getBoundingClientRect().width<60&&!document.querySelector('[aria-label=Done] .task-card')",
    "Collapsed columns reclaim width and unmount their cards",
  );
  await click('[aria-label="Add task to Today"]');
  await assert(
    "document.activeElement===document.querySelector('[aria-label=\"New task\"]') && !!document.querySelector('[aria-label=Today] .task-compose-card')",
    "Add task opens a focused inline card in its column",
  );
  await fill('[aria-label="New task"]', "Book a quiet afternoon");
  await fill('[aria-label="New task tags"]', "Personal, Work");
  await screenshot("workflow-composer");
  await button("Add card");
  await assert(
    "document.querySelector('[data-task-title=\"Book a quiet afternoon\"] .task-pills').textContent==='PersonalWork'",
    "Multiple tags render as small named pills",
  );
  await button("Cancel");
  await select('[aria-label="Category for Book a quiet afternoon"]', "To do");
  await assert(
    "!!document.querySelector('[aria-label=\"To do\"] [data-task-title=\"Book a quiet afternoon\"]')&&document.querySelector('[data-task-title=\"Book a quiet afternoon\"] .task-pills').textContent==='PersonalWork'",
    "Moving workflow stage preserves independent tags",
  );
  await click('[aria-label="Edit Book a quiet afternoon"]');
  await fill('[aria-label="Tags for Book a quiet afternoon"]', "Personal, Rest");
  await button("Save task");
  await fill('[aria-label="Filter tasks"]', "Rest");
  await assert(
    "document.querySelectorAll('.task-card').length===1",
    "Tag search finds tasks across workflow stages",
  );
  await button("Clear filters");
  await click('[aria-label="Add task to Backlog"]');
  await fill('[aria-label="New task"]', "Cancel this card");
  await button("Cancel");
  await assert(
    "!document.querySelector('[data-task-title=\"Cancel this card\"]')&&!document.querySelector('.task-compose-card')",
    "Cancel discards only the unsubmitted inline card",
  );
  await click('[aria-label="Add task to Today"]');
  await fill('[aria-label="New task"]', "Escape this card");
  await fill('[aria-label="New task tags"]', "Personal");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await assert(
    "!document.querySelector('.task-compose-card')&&!document.querySelector('[data-task-title=\"Escape this card\"]')",
    "Escape from the tag field cancels the unsubmitted card",
  );
  await click('[aria-label="Add task to Today"]');
  await fill('[aria-label="New task"]', "Keep this card on blur");
  await evaluate("document.querySelector('[aria-label=\"Filter tasks\"]').focus()");
  await assert(
    "!!document.querySelector('[data-task-title=\"Keep this card on blur\"]')",
    "Leaving a valid inline card retains it in the recovery draft",
  );
  await evaluate("window.runtime.EventsEmit('menu:save')");
  await assert(
    "window.go.main.App.GetSession().then(s=>!s.notes.find(n=>n.id===s.activeId).dirty)",
    "Workflow metadata saves as ordinary Markdown",
  );
  await open(finishedFixture);
  await open(workflowFixture);
  await assert(
    "!!document.querySelector('[aria-label=\"Expand Done\"]')",
    "Column collapse survives switching documents",
  );
  await evaluate(
    "document.documentElement.dataset.appearance='light';document.documentElement.style.colorScheme='light'",
  );
  if (await evaluate("!!document.querySelector('[aria-label=\"Close task search\"]')"))
    await click('[aria-label="Close task search"]');
  await screenshot("workflow-light");
  await assert(
    "[...document.querySelectorAll('.task-workflow .task-column:not(.is-collapsed)')].every(column=>{const cards=column.querySelectorAll('.task-card'),add=column.querySelector('.task-column-add');return !cards.length||!add||add.getBoundingClientRect().top>=cards[cards.length-1].getBoundingClientRect().bottom})",
    "Inline add controls stay below cards and attached notes without overlap",
  );
  await click('[aria-label="Expand Done"]');
  await assert(
    "!!document.querySelector('[aria-label=Done] [data-task-title=\"Keep notes portable\"]')",
    "Expanding restores the column's tasks",
  );
  await evaluate(
    "document.documentElement.dataset.appearance='dark';document.documentElement.style.colorScheme='dark'",
  );
  await screenshot("workflow-dark");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await screenshot("workflow-narrow");
  await assert(
    "document.documentElement.scrollWidth<=innerWidth",
    "Workflow board stays contained in narrow windows",
  );
  await call("Emulation.clearDeviceMetricsOverride");
  await open(finishedFixture);
  const legacyBeforeUpgrade = await source();
  await button("Separate columns and tags");
  await assert(
    "!!document.querySelector('.task-workflow')&&[...document.querySelectorAll('.task-pill')].some(e=>e.textContent==='Work')",
    "Existing board categories upgrade to independent tags",
  );
  await evaluate("window.runtime.EventsEmit('menu:undo')");
  await until(
    async () => (await source()) === legacyBeforeUpgrade,
    "Upgrade undo restores exact original Markdown",
  );
  checks.push("Upgrade undo restores exact original Markdown");
  await open(workflowFixture);
  await button("Board");
  await evaluate(
    "(()=>{const e=document.querySelector('[aria-label=\"Move Today column\"]');window.columnDrag=new DataTransfer();e.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.columnDrag}));})()",
  );
  await pause(90);
  await evaluate(
    "document.querySelector('.task-column[aria-label=Backlog]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:window.columnDrag}))",
  );
  await assert(
    "document.querySelector('.task-column')?.getAttribute('aria-label')==='Today'",
    "Dragging a whole column persists its new position",
  );
  await button("List");
  await click('[aria-label="Category for Review the design"]');
  await assert(
    "!!document.querySelector('.task-popup [role=listbox]') && document.querySelector('.task-popup').getBoundingClientRect().right<=innerWidth",
    "Custom category menu stays inside the window",
  );
  await screenshot("category-menu");
  await evaluate("document.querySelector('.task-popup [data-value=\"To do\"]').click()");
  await assert(
    "document.querySelector('[aria-label=\"Category for Review the design\"]').dataset.value==='To do'",
    "Custom menu moves a task to its chosen stage",
  );
  await click('[aria-label="Tags for Review the design"]');
  await screenshot("tag-picker");
  await evaluate(
    "[...document.querySelectorAll('.task-popup .task-pill')].find(b=>b.textContent==='Personal').click()",
  );
  await evaluate(
    "[...document.querySelectorAll('.task-popup button')].find(b=>b.textContent==='Done').click()",
  );
  await assert(
    "document.querySelector('[data-task-title=\"Review the design\"] .task-pills').textContent.includes('Personal')",
    "Existing tag pills can be selected without typing",
  );
  const scheduledDay = await evaluate(
    "(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()",
  );
  await click('[aria-label="Due date for Review the design"]');
  const setField = async (selector, value) => {
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await pause(90);
  };
  await setField('[aria-label="Due date"]', scheduledDay);
  await setField('[aria-label="Due time"]', "09:30");
  await screenshot("due-picker");
  await evaluate(
    "[...document.querySelectorAll('.task-popup button')].find(b=>b.textContent==='Apply').click()",
  );
  await assert(
    "document.querySelector('[aria-label=\"Due date for Review the design\"]').textContent.includes('09:30')",
    "Task card shows its chosen due time",
  );
  await click('[aria-label="Edit Review the design"]');
  await fill(
    '[aria-label="Description for Review the design"]',
    "Bring the latest draft and discuss the next step.",
  );
  await button("Save task");
  await assert(
    "document.querySelector('[data-task-title=\"Review the design\"] .task-description').textContent==='Bring the latest draft and discuss the next step.'&&!document.querySelector('.task-details')",
    "Descriptions are readable and editable without a Notes disclosure",
  );
  await button("Calendar");
  await assert(
    "document.querySelectorAll('.task-calendar .task-day').length===42",
    "Calendar has a stable six-week month grid",
  );
  await click(`[aria-label^="Choose ${scheduledDay}"]`);
  await assert(
    "!!document.querySelector('.task-agenda [data-task-title=\"Review the design\"]')",
    "Calendar agenda shows tasks on their local due date",
  );
  await screenshot("calendar-dark");
  await evaluate(
    "document.documentElement.dataset.appearance='light';document.documentElement.style.colorScheme='light'",
  );
  await screenshot("calendar-light");
  await assert(
    "!!document.querySelector('.task-unscheduled summary')",
    "Unscheduled tasks remain accessible in the calendar",
  );
  await button("Add task on this day");
  await fill('[aria-label="New task"]', "Prepare for tomorrow");
  await button("Add card");
  await button("Cancel");
  await assert(
    "!!document.querySelector('.task-agenda [data-task-title=\"Prepare for tomorrow\"]')",
    "Calendar creation assigns the selected date",
  );
  await evaluate("window.runtime.EventsEmit('menu:save')");
  await assert(
    "window.go.main.App.GetSession().then(s=>!s.notes.find(n=>n.id===s.activeId).dirty)",
    "Scheduled tasks save cleanly",
  );
  const scheduledSource = await readFile(workflowFixture, "utf8");
  if (
    !scheduledSource.includes(`<!-- due: ${scheduledDay}T09:30 -->`) ||
    !scheduledSource.includes("Bring the latest draft")
  )
    throw Error("Scheduled metadata or description was not persisted");
  checks.push("Due date, local time and description persist in Markdown");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await screenshot("calendar-narrow");
  await assert(
    "document.documentElement.scrollWidth<=innerWidth",
    "Calendar fits a narrow window at increased scale",
  );
  await call("Emulation.clearDeviceMetricsOverride");
  await button("Board");

  await click('[aria-label="Tags for Keep this card on blur"]');
  await evaluate(
    "[...document.querySelectorAll('.task-popup .task-pill')].find(b=>b.textContent==='Work').click()",
  );
  await assert(
    "!!document.querySelector('.task-popup .task-pill[aria-pressed=true]')",
    "Adding the first tag keeps the pill chooser open",
  );
  await click(".task-popup .task-pill[aria-pressed=true]");
  await assert(
    "!!document.querySelector('.task-popup') && !document.querySelector('.task-popup .task-pill[aria-pressed=true]')",
    "Removing the last tag keeps the pill chooser open",
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await assert(
    "!document.querySelector('.task-popup') && document.activeElement.getAttribute('aria-label')==='Tags for Keep this card on blur'",
    "Escape closes a picker and restores its keyboard anchor",
  );
  await button("List");
  await button("Add task");
  await assert(
    "document.querySelector('[aria-label=\"New task due date\"]').textContent==='Due date'",
    "New list cards do not inherit a previous calendar date",
  );
  await button("Cancel");
  await button("Board");
  await screenshot("scheduled-board");

  await assert(
    "!document.querySelector('.task-board .task-stage') && !document.querySelector('.task-list-tools')",
    "Board removes repeated category controls and the redundant count row",
  );
  await assert(
    "(()=>{const n=document.querySelector('.task-view-toolbar').getBoundingClientRect(),s=document.querySelector('.task-view-switch').getBoundingClientRect();return Math.abs((n.left+n.right-s.left-s.right)/2)<2})()",
    "Task layout tabs are centered below the document controls",
  );
  await assert(
    "[...document.querySelectorAll('.task-board .task-card-actions')].every(e=>{const d=e.querySelector('.task-due'),t=e.querySelector('.task-tag-control');return !d||!t||d.getBoundingClientRect().left<t.getBoundingClientRect().left})",
    "Board dates stay left and tag controls stay right",
  );
  await evaluate(
    "document.querySelector('[data-task-title=\"Review the design\"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:600,clientY:300}))",
  );
  await assert(
    "!!document.querySelector('.task-popup[aria-label=\"Task actions\"]')",
    "Right-click opens task actions",
  );
  await screenshot("context-menu");
  await evaluate(
    "[...document.querySelectorAll('.task-popup button')].find(e=>e.textContent==='Move to category…').click()",
  );
  await pause(90);
  await evaluate(
    "[...document.querySelectorAll('.task-popup button')].find(e=>e.textContent==='Today').click()",
  );
  await assert(
    "document.querySelector('[data-task-title=\"Review the design\"]').dataset.category==='Today'",
    "Context menu moves a card without a redundant board selector",
  );
  await evaluate("window.runtime.EventsEmit('menu:find')");
  await assert(
    "!!document.querySelector('.task-search-panel')",
    "Global Search opens task search while viewing a task file",
  );
  await fill('[aria-label="Filter tasks"]', "latest draft");
  await assert(
    "document.querySelectorAll('.task-card').length===1 && !!document.querySelector('.task-card mark') && !!document.querySelector('.task-search-result mark')",
    "Sidebar search finds and highlights attached task descriptions",
  );
  await screenshot("search-highlights");
  await click('[aria-label="Close task search"]');
  await button("Categories");
  await assert(
    "!!document.querySelector('.task-manager-dialog:modal')",
    "Categories and tags open in a focused native dialog",
  );
  await screenshot("categories-dialog");
  await click('[aria-label="Color for category Today"]');
  await setField('[aria-label="Today Hue"]', "190");
  await setField('[aria-label="Today Chroma"]', "0.12");
  await screenshot("oklch-wheel");
  await button("Apply color");
  await assert(
    "window.go.main.App.GetActiveContent().then(s=>s.includes('\"h\":190'))",
    "Category OKLCH choice persists in the Markdown color record",
  );
  await click('[aria-label="Color for tag Work"]');
  await setField('[aria-label="Work Hue"]', "35");
  await button("Apply color");
  await button("Categories");
  await assert(
    "document.querySelector('.task-column[aria-label=Today]').style.getPropertyValue('--task-custom-rgb')!==''",
    "Chosen category color reaches the board column",
  );
  await assert(
    "[...document.querySelectorAll('.task-card .task-pill')].filter(e=>e.textContent==='Work').every(e=>e.style.getPropertyValue('--task-custom-rgb')!=='')",
    "Tag pills use their own shared colors",
  );
  await screenshot("colored-board-light");
  await evaluate(
    "document.documentElement.dataset.appearance='dark';document.documentElement.style.colorScheme='dark'",
  );
  await screenshot("colored-board-dark");
  await button("Calendar");
  await assert(
    "document.querySelector('.task-calendar-agendas').getBoundingClientRect().left>=document.querySelector('.task-calendar-month').getBoundingClientRect().right",
    "Calendar agenda sits to the right of the month grid",
  );
  await screenshot("calendar-agenda-dark");
  await evaluate(
    "document.documentElement.dataset.appearance='light';document.documentElement.style.colorScheme='light'",
  );
  await assert(
    "(()=>{const a=document.querySelector('.task-calendar-agendas').getBoundingClientRect();const v=document.querySelector('.task-view-toolbar').getBoundingClientRect();return a.right<=innerWidth&&v.width>innerWidth/2})()",
    "Calendar layout stays inside the task pane without moving the page header",
  );
  await screenshot("calendar-agenda-light");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await screenshot("calendar-agenda-narrow");
  await assert(
    "document.documentElement.scrollWidth<=innerWidth",
    "Side-by-side calendar remains contained at narrow widths",
  );
  await call("Emulation.clearDeviceMetricsOverride");
  await evaluate("window.runtime.EventsEmit('menu:save')");
  await assert(
    "window.go.main.App.GetSession().then(s=>!s.notes.find(n=>n.id===s.activeId).dirty)",
    "Custom colors and task changes save through the normal recovery path",
  );
  await button("Board");
  if (errors.length) throw Error(JSON.stringify(errors));
  await writeFile(
    output,
    JSON.stringify(
      {
        checks,
        readyMs,
        paintFromLaunch,
        largeReadyMs,
        samples,
        paletteContrast,
        errors,
        requests,
        profile,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ checks: checks.length, readyMs, paintFromLaunch, largeReadyMs, profile }),
  );
} finally {
  try {
    await call?.("Runtime.evaluate", { expression: "window.go.main.App.QuitWithoutSaving()" });
  } catch {}
  for (const s of sockets) s.close();
  app.kill();
}
