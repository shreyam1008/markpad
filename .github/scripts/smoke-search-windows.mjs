// Genuine Wails/WebView2 search interaction checks in a disposable profile.
// Build with build-performance-windows.py; run with Bun: binary output-prefix.
// Optional third argument injects a diagnostic IIFE bundle of the search helper.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const [binary, output, benchmarkBundle] = process.argv.slice(2);
if (process.platform !== "win32" || !binary || !output)
  throw Error("Usage on Windows: bun smoke-search-windows.mjs profiling.exe output-prefix");
try {
  if ((await fetch("http://127.0.0.1:49271/json/version")).ok)
    throw Error("Profiling port 49271 is already occupied");
} catch (error) {
  if (error.message.includes("already occupied")) throw error;
}
await mkdir(dirname(resolve(output)), { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "quillpane-search-smoke-"));
const alphaPath = join(profile, "Research notes.md");
const betaPath = join(profile, "Weekend plans.md");
const codePath = join(profile, "Example.ts");
const alpha = "# Research notes\r\nUnicode compass 🧭 writing\r\n" + "An ordinary line of writing.\r\n".repeat(65) + "Morning orchard plan\r\n";
const alphaEditor = alpha.replace(/\r\n/g, "\n");
const beta = "# Weekend plans\n\nEvening orchard walk\n";
const code = "// Source notes\r\n// 🧭 Keep local notes\r\nconst orchard = 'local';\r\n";
await writeFile(alphaPath, alpha);
await writeFile(betaPath, beta);
await writeFile(codePath, code);
const app = spawn(resolve(binary), [alphaPath, betaPath], {
  windowsHide: true,
  env: { ...process.env, APPDATA: profile, LOCALAPPDATA: profile },
  stdio: "ignore",
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sockets = [];
const checks = [];
const screenshots = [];
const errors = [];
const network = [];
const copyTimings = [];
let call;
let evaluate;
async function until(fn, description) {
  let latestError;
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      latestError = error;
    }
    if (app.exitCode !== null) throw Error(`Native application exited: ${app.exitCode}`);
    await pause(100);
  }
  throw Error(description + (latestError ? ` (${latestError.message})` : ""));
}
async function connect(url) {
  const socket = new WebSocket(url);
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails);
    } else if (message.method === "Network.requestWillBeSent") {
      network.push(message.params.request.url);
    }
  };
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error(`CDP timed out: ${method}`));
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function screenshot(name) {
  await pause(200);
  if (evaluate && await evaluate("!!document.querySelector('.content-search-panel')")) {
    await until(() => evaluate("document.querySelector('.content-search-results')?.getAttribute('aria-busy')==='false'"), "Search did not settle before screenshot");
  }
  const result = await call("Page.captureScreenshot", { format: "png" });
  const path = resolve(output + "-" + name + ".png");
  await writeFile(path, Buffer.from(result.data, "base64"));
  screenshots.push(path);
}
async function assert(expression, description) {
  await until(() => evaluate(expression), description);
  checks.push(description);
}
async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
  const parameters = { key, code, windowsVirtualKeyCode, modifiers };
  await call("Input.dispatchKeyEvent", { type: "keyDown", ...parameters });
  await call("Input.dispatchKeyEvent", { type: "keyUp", ...parameters });
  await pause(80);
}
async function fill(selector, text) {
  await assert(`!!document.querySelector(${JSON.stringify(selector)})`, `Input is present: ${selector}`);
  await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.focus();input.select();})()`);
  await call("Input.insertText", { text });
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await pause(80);
}
async function search(query) {
  await key("F", "KeyF", 70, 10);
  await assert("!!document.querySelector('.content-search-panel')", "Ctrl+Shift+F opens content search");
  await fill('input[aria-label="Search open notes"]', query);
  await pause(100);
  await until(() => evaluate("document.querySelector('.content-search-summary')?.textContent.includes('match') && document.querySelector('.content-search-summary')?.textContent.includes(' in ') && document.querySelector('.content-search-results')?.getAttribute('aria-busy')==='false'"), "Search did not finish the current query");
}
async function choose(title) {
  await assert(
    `[...document.querySelectorAll('.content-search-result')].some(button=>button.getAttribute('aria-label').includes(${JSON.stringify(title)}))`,
    `Content result identifies ${title}`,
  );
  await evaluate(`[...document.querySelectorAll('.content-search-result')].find(button=>button.getAttribute('aria-label').includes(${JSON.stringify(title)})).click()`);
}
const visibleToast =
  "document.querySelector('.clipboard-toast-message')?.textContent==='Copied to clipboard'";
const copyState = `(()=>{
  const editor=document.querySelector('textarea#editor'),code=document.querySelector('.cm-content');
  const rect=selector=>{const box=document.querySelector(selector)?.getBoundingClientRect();return box&&[box.x,box.y,box.width,box.height];};
  return {
    focus:document.activeElement===editor?'textarea':document.activeElement===code?'code':document.activeElement?.tagName,
    selected:editor?editor.value.slice(editor.selectionStart,editor.selectionEnd):window.getSelection().toString(),
    source:editor?.value??code?.textContent,
    start:editor?.selectionStart,end:editor?.selectionEnd,
    scrollTop:editor?.scrollTop??document.querySelector('.cm-scroller')?.scrollTop,
    scrollLeft:editor?.scrollLeft??document.querySelector('.cm-scroller')?.scrollLeft,
    content:rect('#content-area'),sidebar:rect('#sidebar'),pane:rect(editor?'textarea#editor':'.cm-editor')
  };
})()`;
async function assertClipboard(expected, description, normalizeCRLF = false) {
  const normalize = (text) => normalizeCRLF ? text.replace(/\r\n/g, "\n") : text;
  const readback = await until(async () => {
    const text = await evaluate("window.runtime.ClipboardGetText()");
    return normalize(text) === normalize(expected) && { text };
  }, description);
  checks.push(description);
  return readback.text;
}
async function seedClipboard(label) {
  const sentinel = `quillpane-copy-smoke:${label}:${Date.now()}`;
  if (!(await evaluate(`window.runtime.ClipboardSetText(${JSON.stringify(sentinel)})`)))
    throw Error(`${label}: could not seed the native clipboard`);
  await until(() => evaluate(`window.runtime.ClipboardGetText().then(text=>text===${JSON.stringify(sentinel)})`), `${label}: native clipboard sentinel was not installed`);
}
async function finishToast(lastCopyAt, label) {
  await pause(Math.max(0, 700 - (Date.now() - lastCopyAt)));
  if (!(await evaluate(visibleToast))) throw Error(`${label}: toast disappeared before 700 ms`);
  checks.push(`${label}: copy confirmation remains visible before its deadline`);
  while (Date.now() - lastCopyAt <= 1600) {
    if (!(await evaluate(visibleToast))) {
      const hiddenAfterMs = Date.now() - lastCopyAt;
      checks.push(`${label}: copy confirmation auto-hides after approximately one second`);
      return hiddenAfterMs;
    }
    await pause(40);
  }
  throw Error(`${label}: copy confirmation did not hide within 1600 ms`);
}
async function nativeCopy(expected, label, { shot, repeat = false, normalizeCRLF = false } = {}) {
  await until(async () => !(await evaluate(visibleToast)), `${label}: earlier toast did not hide`);
  await seedClipboard(label);
  const before = await evaluate(copyState);
  const firstCopyAt = Date.now();
  await key("c", "KeyC", 67, 2);
  const readback = await assertClipboard(expected, `${label}: native clipboard contains the copied text${normalizeCRLF ? ' (CRLF normalized only for comparison)' : ' exactly'}`, normalizeCRLF);
  await assert(visibleToast, `${label}: native Ctrl+C shows copy confirmation`);
  const shownAfterMs = Date.now() - firstCopyAt;
  await assert(
    `JSON.stringify(${copyState})===${JSON.stringify(JSON.stringify(before))}`,
    `${label}: copying preserves focus, selection, source and pane geometry`,
  );
  if (shot) await screenshot(shot);
  if (shot === "copy-toast-narrow")
    await assert(
      "(()=>{const box=document.querySelector('.clipboard-toast-message').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;})()",
      "Copy confirmation fits the narrow native viewport",
    );
  let lastCopyAt = firstCopyAt;
  if (repeat) {
    await pause(Math.max(0, 600 - (Date.now() - firstCopyAt)));
    await seedClipboard(`${label} repeat`);
    lastCopyAt = Date.now();
    await key("c", "KeyC", 67, 2);
    await assertClipboard(
      expected,
      `${label}: repeated native copy preserves exact clipboard text`,
      normalizeCRLF,
    );
  }
  const hiddenAfterLastCopyMs = await finishToast(lastCopyAt, label);
  if (repeat) checks.push(`${label}: repeated copies restart the confirmation deadline`);
  copyTimings.push({
    label,
    expectedDurationMs: 1000,
    shownAfterMs,
    repeatedAtMs: repeat ? lastCopyAt - firstCopyAt : null,
    hiddenAfterLastCopyMs,
    ...(normalizeCRLF ? { clipboardComparison: { normalizeCRLF: true, expectedFromSource: expected, nativeReadback: readback } } : {}),
  });
}
async function copyFilePath(title, expected) {
  await seedClipboard('Copy Path');
  const before = await evaluate(copyState);
  const point = await evaluate(
    `(()=>{const row=[...document.querySelectorAll('.note-item')].find(item=>item.querySelector('.note-title')?.textContent===${JSON.stringify(title)});if(!row)throw Error('Copy Path note missing');const box=row.getBoundingClientRect();return{x:box.left+80,y:box.top+box.height/2};})()`,
  );
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...point,
    button: "right",
    buttons: 2,
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...point,
    button: "right",
    buttons: 0,
    clickCount: 1,
  });
  await assert(
    "[...document.querySelectorAll('.context-menu button')].some(button=>button.textContent.trim()==='Copy Path')",
    "Native note context menu exposes Copy Path",
  );
  const started = Date.now();
  await evaluate(
    "[...document.querySelectorAll('.context-menu button')].find(button=>button.textContent.trim()==='Copy Path').click()",
  );
  await assertClipboard(expected, "Copy Path writes the exact file path to the native clipboard");
  await assert(visibleToast, "Successful explicit clipboard write shows copy confirmation");
  const after = await evaluate(copyState);
  if (
    before.source !== after.source ||
    JSON.stringify(before.content) !== JSON.stringify(after.content) ||
    JSON.stringify(before.sidebar) !== JSON.stringify(after.sidebar) ||
    JSON.stringify(before.pane) !== JSON.stringify(after.pane)
  )
    throw Error("Copy Path changed source or pane geometry");
  checks.push("Copy Path preserves source and pane geometry");
  await assert(
    "document.querySelector('.clipboard-toast')?.matches('output,[role=\"status\"]') && document.querySelector('.clipboard-toast')?.getAttribute('aria-live')==='polite' && getComputedStyle(document.querySelector('.clipboard-toast')).pointerEvents==='none' && !document.querySelector('.clipboard-toast').contains(document.activeElement)",
    "Copy confirmation is a polite passive status region without focus",
  );
  const hiddenAfterLastCopyMs = await finishToast(started, "Copy Path");
  copyTimings.push({ label: "Copy Path", expectedDurationMs: 1000, hiddenAfterLastCopyMs });
}
try {
  const targets = await until(async () => {
    const list = await (await fetch("http://127.0.0.1:49271/json/list")).json();
    return list.some((target) => target.type === "page") && list;
  }, "Native WebView2 debugger did not start");
  call = await connect(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await assert("!!window.go?.main?.App && !!document.querySelector('#content-area')", "Native app renders");
  await assert("window.go.main.App.GetSession().then(session=>session.notes.some(note=>note.title==='Weekend plans.md'))", "Native file arguments opened both notes");
  const version = execFileSync(resolve(binary), ["--version"], { windowsHide: true, encoding: "utf8" }).trim();
  const testedCommit = execFileSync("git", ["rev-parse", "HEAD"], { windowsHide: true, encoding: "utf8" }).trim();
  const binarySha256 = createHash("sha256").update(await readFile(resolve(binary))).digest("hex");
  const expectedVersion = JSON.parse(await readFile(resolve("frontend/package.json"), "utf8")).version;
  if (version !== expectedVersion) throw Error(`Built version ${version} differs from package ${expectedVersion}`);
  await evaluate("localStorage.setItem('markpad-preferences-v1',JSON.stringify({version:1,themeMode:'light',palette:'markpad',uiScale:1,textSize:14,lineSpacing:'comfortable',readingWidth:'balanced',reducedMotion:true}))");
  await call("Page.reload");
  await assert("!!window.go?.main?.App && !!document.querySelector('#content-area')", "Native app reloads with isolated preferences");
  const nativeViewport = await evaluate("({width:innerWidth,height:innerHeight,sidebarWidth:document.querySelector('#sidebar').getBoundingClientRect().width})");
  await key("1", "Digit1", 49, 2);
  await assert(`document.querySelector('textarea#editor')?.value===${JSON.stringify(beta)}`, "Ctrl+1 opens the current note editor");
  // Open search immediately after a real native edit; do not wait for autosave.
  await evaluate("(()=>{const editor=document.querySelector('textarea#editor');editor.focus();editor.setSelectionRange(editor.value.length,editor.value.length);})()");
  await call("Input.insertText", { text: "Unflushed marigold change\n" });
  await search("marigold");
  await assert("document.querySelectorAll('.content-search-result').length===1 && document.querySelector('.content-search-panel').textContent.includes('Unflushed')", "Search includes the latest unsaved edit");
  await choose("Weekend plans.md");
  await assert("(()=>{const editor=document.querySelector('textarea#editor');return editor&&editor.value.slice(editor.selectionStart,editor.selectionEnd)==='marigold';})()", "Unsaved result selects its exact text");
  if (await readFile(betaPath, "utf8") !== beta) throw Error("Search wrote the unsaved edit to the source file");
  checks.push("Searching and selecting preserve the unsaved source file");

  await search("orchard");
  await assert("document.querySelectorAll('.content-search-result').length===2", "Search finds content across both open notes");
  await assert("document.querySelector('.content-search-panel').textContent.includes('Morning') && document.querySelector('.content-search-panel').textContent.includes('Evening')", "Results show contextual snippets for both notes");
  await assert("document.querySelectorAll('.content-search-result mark').length>=2", "Exact matches are highlighted in snippets");
  await evaluate("window.runtime.EventsEmit('menu:undo')");
  await assert(`document.querySelector('textarea#editor').value===${JSON.stringify(beta + "Unflushed marigold change\n")}`, "Native Undo while the query is focused preserves the note");
  await screenshot("light");
  await evaluate("document.documentElement.dataset.appearance='dark';document.documentElement.style.colorScheme='dark'");
  await screenshot("dark");
  await call("Emulation.setDeviceMetricsOverride", { width: 720, height: 800, deviceScaleFactor: 1, mobile: false });
  await assert("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.content-search-panel').getBoundingClientRect().right<=innerWidth", "Search fits a narrow native viewport");
  await screenshot("narrow");
  await call("Emulation.clearDeviceMetricsOverride");
  await evaluate("document.documentElement.dataset.appearance='light';document.documentElement.style.colorScheme='light'");
  await choose("Research notes.md");
  const position = alphaEditor.indexOf("orchard");
  await assert(`(()=>{const editor=document.querySelector('textarea#editor');return editor&&editor.selectionStart===${position}&&editor.selectionEnd===${position + 7}&&editor.scrollTop>0;})()`, "Cross-note result selects and reveals the exact distant match");
  await screenshot("exact-line");
  await assert("!document.querySelector('.content-search-panel') && document.activeElement===document.querySelector('textarea#editor')", "Result navigation restores editor focus");
  await nativeCopy("orchard", "Textarea selection", { shot: "copy-toast-light" });
  const unicodePrefix = alpha.slice(0, alpha.indexOf("An ordinary"));
  await evaluate(`document.querySelector('textarea#editor').setSelectionRange(0,${unicodePrefix.replace(/\r\n/g, "\n").length})`);
  await nativeCopy(unicodePrefix, "Textarea multiline Unicode selection", { normalizeCRLF: true });
  await evaluate(`document.querySelector('textarea#editor').setSelectionRange(${position},${position + 7})`);

  await key("f", "KeyF", 70, 2);
  await assert("!!document.querySelector('#find-bar') && !document.querySelector('.content-search-panel')", "Ctrl+F keeps current-document find separate");
  await fill("#find-bar input", "orchard");
  await assert("(()=>{const editor=document.querySelector('textarea#editor');return editor.value.slice(editor.selectionStart,editor.selectionEnd)==='orchard'&&document.querySelector('#find-bar').textContent.includes('of 1');})()", "Current-document find selects its own exact occurrence");
  await assert("document.activeElement===document.querySelector('#find-bar input')", "Typing a current-note query keeps input focus");
  await assert(`document.querySelector('textarea#editor').value===${JSON.stringify(alphaEditor)}`, "Current-note find does not edit document content");
  await screenshot("find-current-note");
  const firstOrdinary = alphaEditor.indexOf("ordinary");
  const secondOrdinary = alphaEditor.indexOf("ordinary", firstOrdinary + 8);
  const lastOrdinary = alphaEditor.lastIndexOf("ordinary");
  await fill("#find-bar input", "ordinary");
  await assert(`document.querySelector('textarea#editor').selectionStart===${firstOrdinary} && document.querySelector('#find-bar').textContent.includes('1 of 65')`, "Current-note find starts at the first of 65 CRLF matches");
  await key("Enter", "Enter", 13);
  await assert(`document.querySelector('textarea#editor').selectionStart===${secondOrdinary} && document.querySelector('#find-bar').textContent.includes('2 of 65')`, "Enter selects the next CRLF match");
  await key("Enter", "Enter", 13, 8);
  await assert(`document.querySelector('textarea#editor').selectionStart===${firstOrdinary}`, "Shift+Enter selects the previous CRLF match");
  await key("Enter", "Enter", 13, 8);
  await assert(`document.querySelector('textarea#editor').selectionStart===${lastOrdinary} && document.querySelector('#find-bar').textContent.includes('65 of 65')`, "Previous current-note find wraps to the final CRLF match");
  await key("Enter", "Enter", 13);
  await assert(`document.querySelector('textarea#editor').selectionStart===${firstOrdinary} && document.activeElement===document.querySelector('#find-bar input')`, "Next current-note find wraps and preserves query focus");
  await assert(`document.querySelector('textarea#editor').value===${JSON.stringify(alphaEditor)}`, "Repeated next/previous find preserves the entire note");
  await key("Escape", "Escape", 27);

  await search("orcherd");
  await assert("document.querySelectorAll('.content-search-result').length===0 && document.querySelector('.content-search-empty')?.textContent.includes('No matching') && !document.querySelector('.content-search-options input').checked", "Typo tolerance is off by default");
  await click('.content-search-options input[type="checkbox"]');
  await assert("document.querySelectorAll('.content-search-result').length===2", "Opt-in tolerance finds one-substitution matches");
  await screenshot("one-typo");
  await key("Escape", "Escape", 27);
  await key("n", "KeyN", 78, 2);
  await assert("!!document.querySelector('textarea#editor')", "New unsaved note opens in the editor");
  await evaluate("(()=>{const editor=document.querySelector('textarea#editor');editor.focus();editor.select();})()");
  await call("Input.insertText", { text: "# A fresh thought\nA violet comet worth remembering.\n" });
  await search("violet");
  await assert("document.querySelectorAll('.content-search-result').length===1 && document.querySelector('.content-search-panel').textContent.includes('comet')", "Search includes a new unsaved draft");
  await screenshot("unsaved-draft");
  await key("Escape", "Escape", 27);

  await evaluate(`window.go.main.App.OpenDroppedFile(${JSON.stringify(codePath)}).then(()=>window.runtime.EventsEmit('secondInstance'))`);
  await assert("document.querySelector('.document-title')?.textContent.trim()==='Example.ts'", "Code fixture opens through the native desktop API");
  await search("orchard");
  await choose("Example.ts");
  await assert("!!document.querySelector('.cm-content') && document.activeElement===document.querySelector('.cm-content') && window.getSelection().toString()==='orchard'", "Cross-note result selects exact source in native CodeMirror");
  await screenshot("code-selection");
  await evaluate("document.documentElement.dataset.appearance='dark';document.documentElement.style.colorScheme='dark'");
  await nativeCopy("orchard", "CodeMirror selection", { shot: "copy-toast-dark", repeat: true });
  await call("Emulation.setDeviceMetricsOverride", { width: 720, height: 800, deviceScaleFactor: 1, mobile: false });
  await key("ArrowLeft", "ArrowLeft", 37);
  await nativeCopy("const orchard = 'local';", "CodeMirror current line without selection", { shot: "copy-toast-narrow" });
  await call("Emulation.clearDeviceMetricsOverride");
  await until(() => evaluate(`innerWidth===${nativeViewport.width}&&innerHeight===${nativeViewport.height}&&document.querySelector('#sidebar').getBoundingClientRect().width===${nativeViewport.sidebarWidth}`), 'Native viewport and responsive shell restoration did not settle');
  await evaluate("document.documentElement.dataset.appearance='light';document.documentElement.style.colorScheme='light'");
  await copyFilePath("Example.ts", codePath);
  if (await readFile(alphaPath, "utf8") !== alpha || await readFile(codePath, "utf8") !== code)
    throw Error("Search changed a source file");
  if (errors.length) throw Error("Native runtime errors: " + JSON.stringify(errors));
  const remoteRequests = network.filter((url) => /^https?:\/\//.test(url) && new URL(url).hostname !== "wails.localhost");
  if (remoteRequests.length) throw Error("Search made network requests: " + remoteRequests.join(", "));
  if (benchmarkBundle) {
    const helper = await readFile(resolve(benchmarkBundle), "utf8");
    await evaluate(helper);
    const benchmark = await evaluate(`(async()=>{
      const {searchOpenNotes}=globalThis.__quillpaneSearchBenchmark;
      const sentence='# Planning notes\\nAn ordinary paragraph about release ownership and practical next steps.\\n';
      const buffers=(count,size)=>Array.from({length:count},(_,index)=>({id:String(index),title:'Note '+index,content:sentence.repeat(Math.ceil(size/sentence.length)).slice(0,size)+'\\nrare-milestone\\n'}));
      const normal=buffers(20,32768),large=buffers(8,2000000),results=[];
      const cases=[
        ['20 x 32KiB / sparse exact',normal,'rare-milestone',{},30],
        ['20 x 32KiB / missing exact',normal,'nonexistent',{},30],
        ['20 x 32KiB / common exact capped',normal,'ordinary',{},30],
        ['20 x 32KiB / one typo',normal,'owenrship',{fuzzy:true},30],
        ['20 x 32KiB / fuzzy no match',normal,'nonexistent',{fuzzy:true},30],
        ['8 x 2MB / missing exact',large,'nonexistent',{},10],
        ['8 x 2MB / fuzzy no match',large,'nonexistent',{fuzzy:true},10]
      ];
      for(const [name,notes,query,options,samples]of cases){
        for(let index=0;index<5;index++)await searchOpenNotes(notes,query,options);
        const times=[];let result;
        for(let index=0;index<samples;index++){const start=performance.now();result=await searchOpenNotes(notes,query,options);times.push(performance.now()-start);}
        times.sort((left,right)=>left-right);
        results.push({name,medianMs:+times[Math.floor(samples/2)].toFixed(2),p95Ms:+times[Math.ceil(samples*.95)-1].toFixed(2),samples,matches:result.matches.length,truncated:result.truncated});
      }
      const controller=new AbortController(),start=performance.now();
      const pending=searchOpenNotes(large,'nonexistent',{fuzzy:true,signal:controller.signal});
      let abortAt=0;setTimeout(()=>{abortAt=performance.now()-start;controller.abort();},0);
      const cancelled=await pending;
      delete globalThis.__quillpaneSearchBenchmark;
      return {timestampUTC:new Date().toISOString(),runtime:navigator.userAgent,fixture:{synthetic:true,normalNotes:normal.length,normalCharacters:normal.reduce((sum,note)=>sum+note.content.length,0),largeNotes:large.length,largeCharacters:large.reduce((sum,note)=>sum+note.content.length,0),warmups:5,noteBody:sentence},results,cancellation:{cancelled:cancelled.cancelled,abortAtMs:+abortAt.toFixed(2),settledAtMs:+(performance.now()-start).toFixed(2)}};
    })()`);
    const source = await readFile(resolve("frontend/src/workspace/content-search.ts"));
    await writeFile(resolve(output + "-benchmark.json"), JSON.stringify({
      ...benchmark,
      renderer: "native Windows WebView2",
      version,
      testedCommit,
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      helperSha256: createHash("sha256").update(helper).digest("hex"),
      webView: await (await fetch("http://127.0.0.1:49271/json/version")).json(),
      limitations: "Injected isolated bundle of the production search helper runs in the actual native WebView2 JS engine. Includes matching, snippets, and cooperative event-loop yields; excludes native buffer reads, UI debounce, layout, and cold startup. Synthetic warm buffers and capped common results do not establish a universally fastest engine.",
    }, null, 2));
  }
  await writeFile(resolve(output + ".json"), JSON.stringify({ renderer: "native Windows WebView2", version, testedCommit, binarySha256, profilingBuild: true, checks, copyTimings, screenshots, errors, remoteRequests, profile }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, version, testedCommit, screenshots, profile }, null, 2));
} catch (error) {
  if (call) {
    try { await screenshot("failure"); } catch {}
  }
  throw error;
} finally {
  try { await evaluate?.("window.go.main.App.QuitWithoutSaving()"); } catch {}
  for (const socket of sockets) socket.close();
  if (app.exitCode === null) app.kill();
}
