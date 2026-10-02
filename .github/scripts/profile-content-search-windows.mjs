// Diagnostic native WebView2 scaling profile. Never ship the profiling binary.
// bun .github/scripts/profile-content-search-windows.mjs profiling.exe output-directory
// Optional --source=preserved-content-search.ts --only=comma,separated,scenario,ids
// --native-only runs targeted UI cases without repeating helper timings.
// Baseline semantics: --snapshot-policy=stop-at-first-overflow --highlight-policy=bounded.
// List DOM: --sidebar-only. Current defaults use skip-unfittable/full-span.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir, cpus } from "node:os";
import { join, resolve } from "node:path";

const [binaryArgument, outputArgument, ...arguments_] = process.argv.slice(2);
if (process.platform !== "win32" || !binaryArgument || !outputArgument)
  throw Error(
    "Usage on Windows: bun profile-content-search-windows.mjs profiling.exe output-directory [--source=file] [--only=ids]",
  );
const binary = resolve(binaryArgument),
  output = resolve(outputArgument);
const sourceArgument = arguments_.find((value) => value.startsWith("--source="))?.slice(9);
const sourcePath = resolve(sourceArgument || "frontend/src/workspace/content-search.ts");
const only = arguments_
  .find((value) => value.startsWith("--only="))
  ?.slice(7)
  .split(",");
const snapshotPolicy =
  arguments_.find((value) => value.startsWith("--snapshot-policy="))?.slice(18) ||
  "skip-unfittable";
const highlightPolicy =
  arguments_.find((value) => value.startsWith("--highlight-policy="))?.slice(19) || "full-span";
if (!["bounded", "full-span"].includes(highlightPolicy)) throw Error("Unknown highlight policy");
const sidebarOnly = arguments_.includes("--sidebar-only");
const nativeOnly = arguments_.includes("--native-only");
if (!["stop-at-first-overflow", "skip-unfittable"].includes(snapshotPolicy))
  throw Error("Unknown snapshot policy");
const binaryCommit =
  process.env.PROFILE_BINARY_COMMIT ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
const pause = (ms) => new Promise((resolve_) => setTimeout(resolve_, ms));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const Mi = 1024 * 1024;
const scenarios = [
  { id: "small", sizes: [1024] },
  { id: "standard20", sizes: Array(20).fill(32768) },
  { id: "many100", sizes: Array(100).fill(1024) },
  { id: "many1000", sizes: Array(1000).fill(1024) },
  {
    id: "many1000medium",
    sizes: [1024, ...Array(998).fill(16384), 16 * Mi - 1024 - 998 * 16384],
    optional: true,
  },
  { id: "cap8", sizes: [1024, ...Array(7).fill(Mi), Mi - 1024] },
  { id: "cap16", sizes: [1024, ...Array(15).fill(Mi), Mi - 1024] },
  { id: "cap16escaped", sizes: [1024, ...Array(15).fill(Mi), Mi - 1024], escaped: true },
  { id: "varied16", sizes: [1024, ...Array(15).fill(Mi), Mi - 1024], varied: true },
  { id: "over32", sizes: [1024, ...Array(32).fill(Mi)] },
  { id: "oversizedDraft", sizes: [1024, 20 * Mi, 1024], recoveryOnlyIndex: 1 },
  {
    id: "inactiveMultiPage",
    sizes: [1024, 2 * Mi, 1024],
    escaped: true,
    recoveryOnlyIndex: 1,
    recoverySavedUnits: 2 * Mi,
    boundary: true,
  },
  {
    id: "worstJsonRecovery",
    sizes: [1024, Mi],
    recoveryOnlyIndex: 1,
    worstJson: true,
    optional: true,
  },
  { id: "wrappedMarkdown", sizes: [32768], markdown: true, optional: true },
  { id: "horizontalPlain", sizes: [65536], horizontal: true, optional: true },
].filter((scenario) => (!only || only.includes(scenario.id)) && (!scenario.optional || only));
await mkdir(output, { recursive: true });
try {
  if ((await fetch("http://127.0.0.1:49271/json/version")).ok)
    throw Error("Exclusive diagnostic port 49271 is already occupied");
} catch (error) {
  if (error.message.includes("already occupied")) throw error;
}
const source = await readFile(sourcePath);
const sourceSnapshot = join(output, "content-search-profile-source.ts");
await writeFile(sourceSnapshot, source);
const entry = join(output, "helper-entry.ts"),
  bundlePath = join(output, "search-helper.js");
await writeFile(
  entry,
  'import {searchOpenNotes,searchNoteContent} from "./content-search-profile-source"; globalThis.__quillpaneContentSearchProfileHelper={searchOpenNotes,searchNoteContent};',
);
const bundle = await Bun.build({
  entrypoints: [entry],
  target: "browser",
  format: "iife",
  minify: false,
  naming: "search-helper.js",
  outdir: output,
});
if (!bundle.success) throw Error(String(bundle.logs));
const helperSource = await readFile(bundlePath, "utf8");
const report = {
  startedUTC: new Date().toISOString(),
  renderer: "native Windows WebView2",
  binary,
  binaryCommit,
  binarySha256: hash(await readFile(binary)),
  binarySize: (await readFile(binary)).length,
  version: execFileSync(binary, ["--version"], { encoding: "utf8", windowsHide: true }).trim(),
  sourcePath,
  sourceSha256: hash(source),
  sourceSnapshot,
  helperSha256: hash(helperSource),
  bundlePath,
  snapshotPolicy,
  highlightPolicy,
  repositoryAtRun: {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim(),
    status: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8", windowsHide: true }),
    trackedDiffSha256: hash(
      execFileSync("git", ["diff", "--binary"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ),
  },
  workspaceRuntimeSourceHashesAtRunStart: Object.fromEntries(
    await Promise.all(
      [
        "content_search_snapshot.go",
        "frontend/src/components/ContentSearchPanel.tsx",
        "frontend/src/components/DocumentWorkspace.tsx",
        "frontend/src/workspace/types.ts",
        "frontend/src/workspace/client.ts",
        "frontend/src/workspace/content-search.ts",
        "frontend/src/App.tsx",
        "main.go",
        ".github/scripts/profile-content-search-windows.mjs",
      ].map(async (path) => [path, hash(await readFile(resolve(path)))]),
    ),
  ),
  controller: {
    bun: Bun.version,
    platform: process.platform,
    cpu: cpus()[0]?.model,
    logicalCPUs: cpus().length,
  },
  instrumentation: {
    helper:
      "Injected diagnostic IIFE copied from the reported production search source, executed in actual native WebView2. Warm buffers; native reads, debounce and DOM excluded.",
    ui: "Native Ctrl+Shift+F and trusted Input.insertText; diagnostic MutationObserver records readiness. Input-to-results includes the 80ms debounce. Snapshot opening includes native recovery reads/bridge and React. Two requestAnimationFrame callbacks give a presentation opportunity proxy, not GPU paint proof.",
    memory:
      "Runtime.getHeapUsage usedSize sampled every 50ms. Reported maximum is sampled, not an absolute allocation peak. Whole owned app/WebView2 process tree PrivateMemorySize64 is private committed bytes, sampled every 200ms; shared working sets are never summed. Natural post-close and explicit forced-GC diagnostic are separate.",
    cpu: "V8 CPU profiles are separate instrumented runs at1000us and exclude native Go/GPU/waiting. CDP SystemInfo cumulative process CPU counters (seconds, OS quantized) bracket each operation for owned WebView2 CPU; whole-tree PowerShell CPU samples include the Go host when enough distinct200ms samples exist. Performance ScriptDuration is only the reported counter and may exclude async continuations. TaskDuration/LongTasks and4ms timer gaps describe main-thread work/responsiveness.",
    data: "Synthetic disposable profiles, preseeded native sessions; fixture generation, app startup and UI opening thousands of notes are excluded. Ordinary saved files are<=1MiB, except the explicit accepted2MiB saved-file boundary diagnostic. Its dirty recovery contains Unicode/page-boundary markers. Oversized recovery is a separate20Mi anomaly backed by a small saved file. UTF-16 units are the UI cap's units; ordinary ASCII bytes match units.",
    caps: "Helper result limit is300; dense/many-file results can stop early and do not prove a full scan. Snapshot cap is16Mi UTF-16 units. stop-at-first-overflow matches baseline; skip-unfittable omits a note that exceeds the remaining budget then considers later smaller notes. No claim that32Mi was fully searched.",
  },
  helper: [],
  native: [],
  correctness: [],
  failures: [],
};
report.expectedVersion = JSON.parse(
  await readFile(resolve("frontend/package.json"), "utf8"),
).version;
if (report.version !== report.expectedVersion)
  throw Error(
    `Native version ${report.version} differs from authoritative package version ${report.expectedVersion}`,
  );
const save = () => writeFile(join(output, "profile.json"), JSON.stringify(report, null, 2));
function fixtureContent(
  size,
  index,
  escaped = false,
  varied = false,
  boundary = false,
  worstJson = false,
  horizontal = false,
) {
  const sentence = horizontal
    ? "distant ordinary "
    : worstJson && index === 1
      ? '"\\<>&\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u000b\u000c\u000e\u000f\r\n'
      : escaped
        ? "An\tordinary\tparagraph\tabout\trelease\townership\tand\tpractical\tnext\tsteps.\r\n"
        : "An ordinary paragraph about release ownership and practical next steps.\n";
  const suffix = `${horizontal ? "" : "\n"}rare-milestone marker${String(index).padStart(6, "0")}\n`;
  if (varied) {
    const lines = [];
    let length = 0;
    for (let line = 0; length < size; line++) {
      const text = `Entry${index}_${line} ownership ordinary writing release plan detail${(line * 7919 + index * 104729) % 100003}\r\n`;
      lines.push(text);
      length += text.length;
    }
    return lines.join("").slice(0, size - suffix.length) + suffix;
  }
  let content =
    sentence.repeat(Math.ceil(size / sentence.length)).slice(0, size - suffix.length) + suffix;
  if (boundary && index === 1) {
    const marker = "boundarycross 🧭 café",
      start = 256 * 1024 - 4;
    content = content.slice(0, start) + marker + content.slice(start + marker.length);
    const astral = "prefix𐐀packet-boundary",
      astralStart = 1024 * 1024 - 7;
    content = content.slice(0, astralStart) + astral + content.slice(astralStart + astral.length);
  }
  return content;
}
const queryCases = (scenario) => [
  ["sparse", "rare-milestone", false],
  ["missing", scenario.varied ? "unmatchedcontent" : "nonexistent", false],
  ["dense", "ordinary", false],
  ["typoNear", "milsetone", true],
  ["typoMissing", scenario.varied ? "unmatchedcontent" : "nonexistent", true],
];
function validateHighlights(scenario, caseId, highlights) {
  const cursors = new Map();
  for (const highlight of highlights) {
    const identity = /^Scale (\d+)\.(?:txt|md), line (\d+), column (\d+):/.exec(highlight.title);
    if (!identity)
      throw Error(`Result has no exact accessible source coordinates: ${highlight.title}`);
    const index = Number(identity[1]),
      content = fixtureContent(
        scenario.sizes[index],
        index,
        scenario.escaped,
        scenario.varied,
        scenario.boundary,
        scenario.worstJson,
        scenario.horizontal,
      );
    const word =
      caseId === "sparse" ? "rare-milestone" : caseId === "dense" ? "ordinary" : "milestone";
    const start =
      caseId === "dense"
        ? content.indexOf(word, cursors.get(index) || 0)
        : content.lastIndexOf(word);
    cursors.set(index, start + word.length);
    const preceding = content.slice(0, start),
      breaks = [...preceding.matchAll(/\r\n|\r|\n/g)],
      last = breaks.at(-1);
    const line = breaks.length + 1,
      column = start - (last ? last.index + last[0].length : 0) + 1;
    if (
      start < 0 ||
      highlight.mark !== word ||
      Number(identity[2]) !== line ||
      Number(identity[3]) !== column
    )
      throw Error(
        `Highlighted source coordinates differ from fixture oracle: ${highlight.title}; expected ${line}:${column}`,
      );
  }
}
async function fixture(scenario) {
  const profile = await mkdtemp(join(tmpdir(), "quillpane-scaling-"));
  const storage = join(profile, "markpad"),
    drafts = join(storage, "drafts"),
    files = join(profile, "synthetic-notes");
  await mkdir(drafts, { recursive: true });
  await mkdir(files, { recursive: true });
  const documents = [],
    identities = [];
  for (let index = 0; index < scenario.sizes.length; index++) {
    const id = `scale-${String(index).padStart(6, "0")}`,
      title = `Scale ${String(index).padStart(6, "0")}.${scenario.markdown ? "md" : "txt"}`;
    const content = fixtureContent(
        scenario.sizes[index],
        index,
        scenario.escaped,
        scenario.varied,
        scenario.boundary,
        scenario.worstJson,
        scenario.horizontal,
      ),
      path = join(files, title);
    const saved =
      index === scenario.recoveryOnlyIndex
        ? fixtureContent(
            scenario.recoverySavedUnits || 1024,
            index,
            scenario.escaped,
            scenario.varied,
          )
        : content;
    await writeFile(path, saved);
    await writeFile(join(drafts, `${id}.txt`), content);
    documents.push({
      id,
      title,
      path,
      format: scenario.markdown ? "md" : "txt",
      view_mode: "markdown",
      draft_file: `${id}.txt`,
      dirty: index === scenario.recoveryOnlyIndex,
      updated_at: new Date().toISOString(),
    });
    identities.push({
      id,
      title,
      utf16Units: content.length,
      savedBytes: Buffer.byteLength(saved),
      draftBytes: Buffer.byteLength(content),
      marker: `marker${String(index).padStart(6, "0")}`,
      sourceSha256: hash(saved),
    });
  }
  await writeFile(
    join(storage, "session.json"),
    JSON.stringify({
      active_id: documents[0].id,
      documents,
      preferences: { reduced_motion: true },
      view_modes: {},
    }),
  );
  const includedIdentities = [],
    omitted = [];
  let units = 0;
  for (let index = 0; index < identities.length; index++) {
    const identity = identities[index];
    if (units + identity.utf16Units > 16 * Mi) {
      if (snapshotPolicy === "stop-at-first-overflow") {
        omitted.push(...identities.slice(index));
        break;
      }
      omitted.push(identity);
      continue;
    }
    units += identity.utf16Units;
    includedIdentities.push(identity);
  }
  return {
    profile,
    documents,
    identities,
    included: includedIdentities.length,
    includedIdentities,
    searchedUnits: units,
    omitted,
    totalUnits: scenario.sizes.reduce((sum, value) => sum + value, 0),
  };
}
async function connect(url, exceptions) {
  const socket = new WebSocket(url),
    pending = new Map();
  let id = 0;
  await new Promise((resolve_, reject) => {
    socket.onopen = resolve_;
    socket.onerror = reject;
  });
  socket.onmessage = ({ data }) => {
    const value = JSON.parse(data);
    if (value.id) {
      const request = pending.get(value.id);
      if (!request) return;
      pending.delete(value.id);
      clearTimeout(request.timer);
      if (value.error) request.reject(Error(JSON.stringify(value.error)));
      else request.resolve(value.result);
    } else if (value.method === "Runtime.exceptionThrown")
      exceptions.push(value.params.exceptionDetails);
  };
  return {
    socket,
    call: (method, params = {}) =>
      new Promise((resolve_, reject) => {
        const requestId = ++id,
          timer = setTimeout(() => {
            pending.delete(requestId);
            reject(Error(`CDP timeout: ${method}`));
          }, 180000);
        pending.set(requestId, { resolve: resolve_, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      }),
  };
}
async function launch(fixture_) {
  const app = spawn(binary, [], {
    windowsHide: true,
    env: { ...process.env, APPDATA: fixture_.profile, LOCALAPPDATA: fixture_.profile },
    stdio: "ignore",
  });
  const exceptions = [],
    sockets = [];
  let memoryProcess;
  try {
    async function until(fn, description, timeout = 90000) {
      const start = performance.now();
      let last;
      while (performance.now() - start < timeout) {
        try {
          const value = await fn();
          if (value) return value;
        } catch (error) {
          last = error;
        }
        if (app.exitCode !== null) throw Error(`App exited ${app.exitCode}: ${description}`);
        await pause(20);
      }
      throw Error(description + (last ? ` (${last.message})` : ""));
    }
    const targets = await until(async () => {
      const list = await (await fetch("http://127.0.0.1:49271/json/list")).json();
      return list.find((target) => target.type === "page") && list;
    }, "Native CDP target did not start");
    const version = await (await fetch("http://127.0.0.1:49271/json/version")).json();
    const connection = await connect(
      targets.find((target) => target.type === "page").webSocketDebuggerUrl,
      exceptions,
    );
    sockets.push(connection.socket);
    const browserConnection = await connect(version.webSocketDebuggerUrl, exceptions);
    sockets.push(browserConnection.socket);
    const call = connection.call,
      browserCall = browserConnection.call;
    const evaluate = async (expression) => {
      const result = await call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await call("Runtime.enable");
    await call("Page.enable");
    await call("Performance.enable");
    await call("HeapProfiler.enable");
    await until(
      () => evaluate("!!window.go?.main?.App && !!document.querySelector('#content-area')"),
      "Native content did not render",
    );
    await until(
      () =>
        evaluate(
          `window.go.main.App.GetSession().then(s=>s.notes.length===${fixture_.documents.length}&&s.activeId===${JSON.stringify(fixture_.documents[0].id)})`,
        ),
      "Preseeded native session did not load",
    );
    await evaluate(
      "localStorage.setItem('markpad-preferences-v1',JSON.stringify({version:1,themeMode:'light',palette:'markpad',uiScale:1,textSize:14,lineSpacing:'comfortable',readingWidth:'balanced',reducedMotion:true}))",
    );
    await call("Page.reload");
    await until(
      () => evaluate("!!window.go?.main?.App && !!document.querySelector('textarea#editor')"),
      "Isolated editor did not render",
    );
    const schema = await (await fetch("http://127.0.0.1:49271/json/protocol")).json();
    if (!report.webView) {
      report.webView = version;
      report.protocol = {
        version: schema.version,
        commands: schema.domains
          .filter((domain) =>
            ["Runtime", "Performance", "Memory", "HeapProfiler", "Profiler", "SystemInfo"].includes(
              domain.domain,
            ),
          )
          .map((domain) => ({
            domain: domain.domain,
            commands: domain.commands.filter((command) =>
              [
                "getHeapUsage",
                "getMetrics",
                "getDOMCounters",
                "collectGarbage",
                "getProcessInfo",
                "setSamplingInterval",
                "start",
                "stop",
              ].includes(command.name),
            ),
          })),
      };
      report.viewport = await evaluate(
        "({width:innerWidth,height:innerHeight,devicePixelRatio,visibility:document.visibilityState,userAgent:navigator.userAgent,longTaskSupported:PerformanceObserver.supportedEntryTypes.includes('longtask')})",
      );
    }
    const processInfo = await browserCall("SystemInfo.getProcessInfo");
    const processIDs = [
      ...new Set([app.pid, ...processInfo.processInfo.map((value) => Number(value.id))]),
    ];
    const privateSamples = [];
    let buffer = "";
    // IDs come only from this owned app's private CDP browser and its child processes.
    const memoryCommand = `$profileIds=@(${processIDs.join(",")}); while($true){$profileValues=@(Get-Process -Id $profileIds -ErrorAction SilentlyContinue | ForEach-Object {[pscustomobject]@{id=$_.Id;name=$_.ProcessName;privateBytes=$_.PrivateMemorySize64;cpuSeconds=$_.CPU}}); [pscustomobject]@{utc=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();processes=$profileValues} | ConvertTo-Json -Compress -Depth 4; Start-Sleep -Milliseconds 200}`;
    memoryProcess = spawn("powershell.exe", ["-NoProfile", "-Command", memoryCommand], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    memoryProcess.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const sample = JSON.parse(line);
          sample.totalPrivateBytes = sample.processes.reduce(
            (sum, value) => sum + value.privateBytes,
            0,
          );
          sample.totalCpuSeconds = sample.processes.reduce(
            (sum, value) => sum + (value.cpuSeconds || 0),
            0,
          );
          privateSamples.push(sample);
        } catch {}
      }
    });
    await until(() => privateSamples.length, "Process memory sampler did not start", 20000);
    await pause(500);
    const native = {
      app,
      call,
      browserCall,
      evaluate,
      until,
      exceptions,
      privateSamples,
      processIDs,
      fixture: fixture_,
    };
    native.key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
      const parameters = { key, code, windowsVirtualKeyCode, modifiers };
      await call("Input.dispatchKeyEvent", { type: "keyDown", ...parameters });
      await call("Input.dispatchKeyEvent", { type: "keyUp", ...parameters });
    };
    native.heap = () => call("Runtime.getHeapUsage");
    native.metrics = async () =>
      Object.fromEntries(
        (await call("Performance.getMetrics")).metrics.map((value) => [value.name, value.value]),
      );
    native.memory = async () => {
      const utc = Date.now();
      const heap = await native.heap();
      const dom = await call("Memory.getDOMCounters");
      const privateTree = privateSamples.at(-1);
      return { utc, heap, dom, privateTree, privateSampleAgeMs: utc - privateTree.utc };
    };
    native.gc = async () => {
      await call("HeapProfiler.collectGarbage");
      const collectedAt = Date.now();
      await pause(100);
      // GC is an untimed diagnostic. Avoid attaching a pre-GC process sample to it.
      await until(
        () => privateSamples.at(-1).utc >= collectedAt,
        "Process sampler did not report a post-GC point",
        5000,
      );
      return native.memory();
    };
    native.screenshot = async (name) => {
      await pause(150);
      const capture = await call("Page.captureScreenshot", { format: "png" });
      const path = join(output, `${name}.png`);
      await writeFile(path, Buffer.from(capture.data, "base64"));
      return path;
    };
    native.close = async () => {
      try {
        await evaluate(
          "window.__quillpaneProfileStop?.();delete window.__quillpaneContentSearchProfileHelper;window.go.main.App.QuitWithoutSaving()",
        );
      } catch {}
      memoryProcess.kill();
      for (const socket of sockets) socket.close();
      await pause(200);
      if (app.exitCode === null) app.kill();
      // Wait for the owned browser endpoint to close before the next isolated app.
      for (let index = 0; index < 100; index++) {
        try {
          await fetch("http://127.0.0.1:49271/json/version");
          await pause(50);
        } catch {
          break;
        }
      }
    };
    return native;
  } catch (error) {
    memoryProcess?.kill();
    for (const socket of sockets) socket.close();
    if (app.exitCode === null) app.kill();
    throw error;
  }
}
async function sampled(native, action) {
  const heaps = [];
  let stopped = false;
  const activityStart = await native.evaluate(
    "window.__quillpaneProfile?{tasks:window.__quillpaneProfile.longTasks.length,timers:window.__quillpaneProfile.timerGaps.length}:null",
  );
  const sampler = (async () => {
    while (!stopped) {
      try {
        heaps.push({ utc: Date.now(), ...(await native.heap()) });
      } catch {}
      if (!stopped) await pause(50);
    }
  })();
  const cpuBefore = await native.browserCall("SystemInfo.getProcessInfo");
  const processStart = native.privateSamples.length,
    metricsBefore = await native.metrics(),
    started = performance.now();
  try {
    const value = await action();
    const responsiveness = activityStart
      ? await native.evaluate(
          `(()=>{const tasks=window.__quillpaneProfile.longTasks.slice(${activityStart.tasks}),timers=window.__quillpaneProfile.timerGaps.slice(${activityStart.timers});return{longTasks:tasks,timerMaximumGapMs:Math.max(0,...timers),timerSamples:timers.length};})()`,
        )
      : null;
    return {
      value,
      elapsedControllerMs: performance.now() - started,
      heapSamples: heaps,
      processSamples: native.privateSamples.slice(processStart),
      metricsBefore,
      metricsAfter: await native.metrics(),
      responsiveness,
      cpuBefore: cpuBefore.processInfo,
      cpuAfter: (await native.browserCall("SystemInfo.getProcessInfo")).processInfo,
    };
  } finally {
    stopped = true;
    await sampler;
  }
}
function measurementSummary(measurement) {
  const privateValues = measurement.processSamples.map((value) => value.totalPrivateBytes),
    heaps = measurement.heapSamples.map((value) => value.usedSize);
  const before = measurement.processSamples[0],
    after = measurement.processSamples.at(-1);
  const interval = before && after ? after.utc - before.utc : 0;
  const cpuByPID = new Map(measurement.cpuBefore.map((process_) => [process_.id, process_]));
  const webViewCpu = measurement.cpuAfter.map((process_) => ({
    id: process_.id,
    type: process_.type,
    cpuDeltaMs: (process_.cpuTime - (cpuByPID.get(process_.id)?.cpuTime || 0)) * 1000,
  }));
  return {
    elapsedControllerMs: measurement.elapsedControllerMs,
    sampledHeapMaximumBytes: heaps.length ? Math.max(...heaps) : null,
    sampledTreePrivateMaximumBytes: privateValues.length ? Math.max(...privateValues) : null,
    sampleCount: { heap: heaps.length, privateTree: privateValues.length },
    wholeTreeCpuDeltaSeconds: interval > 0 ? after.totalCpuSeconds - before.totalCpuSeconds : null,
    wholeTreeCpuIntervalMs: interval > 0 ? interval : null,
    webViewProcessCpuDeltaMs: webViewCpu.reduce((sum, process_) => sum + process_.cpuDeltaMs, 0),
    webViewProcessCpu: webViewCpu,
    responsiveness: measurement.responsiveness,
    metricsDelta: Object.fromEntries(
      [
        "TaskDuration",
        "ScriptDuration",
        "LayoutDuration",
        "RecalcStyleDuration",
        "LayoutCount",
        "RecalcStyleCount",
      ].map((name) => [name, measurement.metricsAfter[name] - measurement.metricsBefore[name]]),
    ),
  };
}
async function cpuProfile(native, name, action) {
  await native.call("Profiler.enable");
  await native.call("Profiler.setSamplingInterval", { interval: 1000 });
  await native.call("Profiler.start");
  try {
    return await action();
  } finally {
    const { profile } = await native.call("Profiler.stop");
    await native.call("Profiler.disable");
    await writeFile(join(output, `${name}.cpuprofile`), JSON.stringify(profile));
    const hits = new Map();
    for (const id of profile.samples || []) hits.set(id, (hits.get(id) || 0) + 1);
    const hottest = profile.nodes
      .map((node) => ({
        function: node.callFrame.functionName || "(anonymous)",
        url: node.callFrame.url,
        line: node.callFrame.lineNumber + 1,
        samples: hits.get(node.id) || 0,
      }))
      .sort((left, right) => right.samples - left.samples)
      .slice(0, 15);
    report.cpuProfiles ??= [];
    report.cpuProfiles.push({
      name,
      path: join(output, `${name}.cpuprofile`),
      sampleCount: profile.samples?.length,
      durationMs: (profile.endTime - profile.startTime) / 1000,
      hottest,
    });
  }
}
const watchSource = `(()=>{
  const state={operation:null,longTasks:[],timerGaps:[],queries:[]}; window.__quillpaneProfile=state;
  let last=performance.now(); const timer=setInterval(()=>{const now=performance.now();state.timerGaps.push(now-last);last=now;},4);
  const longObserver=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>{for(const item of list.getEntries())state.longTasks.push({startTime:item.startTime,duration:item.duration});}):null;
  longObserver?.observe({type:'longtask',buffered:false});
  const beforeInput=event=>{if(event.target.matches?.('input[aria-label="Search open notes"]')){state.queries.push({time:performance.now(),data:event.data,trusted:event.isTrusted});if(state.operation?.type==='query')state.operation.inputAt=performance.now();}};
  document.addEventListener('beforeinput',beforeInput,true);
  const observe=()=>{const op=state.operation;if(!op||op.readyAt!==undefined)return;const panel=document.querySelector('.content-search-panel'),input=panel?.querySelector('input[aria-label="Search open notes"]'),summary=panel?.querySelector('.content-search-summary')?.textContent||'',busy=panel?.querySelector('.content-search-results')?.getAttribute('aria-busy');
    if(panel&&op.mountedAt===undefined)op.mountedAt=performance.now();
    const ready=op.type==='open'?panel&&input?.value===''&&busy==='false'&&summary.includes('open text'):panel&&input?.value===op.query&&busy==='false'&&summary.includes('match')&&summary.includes(' in ');
    if(ready){op.readyAt=performance.now();op.summary=summary;op.resultCount=panel.querySelectorAll('.content-search-result').length;requestAnimationFrame(()=>requestAnimationFrame(()=>{op.presentationOpportunityAt=performance.now();}));}
  };const mutation=new MutationObserver(observe);mutation.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
  window.__quillpaneProfileArm=(type,query='')=>{state.operation={type,query,start:performance.now()};observe();};
  window.__quillpaneProfileStop=()=>{clearInterval(timer);longObserver?.disconnect();mutation.disconnect();document.removeEventListener('beforeinput',beforeInput,true);delete window.__quillpaneProfile;delete window.__quillpaneProfileArm;delete window.__quillpaneProfileStop;};
})()`;
async function openPanel(native) {
  await native.evaluate("window.__quillpaneProfileArm('open')");
  await native.key("F", "KeyF", 70, 10);
  await native.until(
    () => native.evaluate("window.__quillpaneProfile.operation?.presentationOpportunityAt"),
    "Snapshot did not settle",
  );
  const operation = await native.evaluate("({...window.__quillpaneProfile.operation})");
  return {
    ...operation,
    snapshotMs: operation.readyAt - operation.start,
    presentationOpportunityMs: operation.presentationOpportunityAt - operation.start,
    panelMountMs: operation.mountedAt - operation.start,
  };
}
async function queryPanel(native, query) {
  await native.evaluate(
    `(()=>{const input=document.querySelector('input[aria-label="Search open notes"]');input.focus();input.select();window.__quillpaneProfileArm('query',${JSON.stringify(query)});})()`,
  );
  await native.call("Input.insertText", { text: query });
  await native.until(
    () => native.evaluate("window.__quillpaneProfile.operation?.presentationOpportunityAt"),
    "Query did not settle",
  );
  const operation = await native.evaluate("({...window.__quillpaneProfile.operation})");
  return {
    ...operation,
    inputToResultsMs: operation.readyAt - operation.inputAt,
    inputToPresentationOpportunityMs: operation.presentationOpportunityAt - operation.inputAt,
    controllerArmToResultsMs: operation.readyAt - operation.start,
  };
}
async function closePanel(native) {
  await native.key("Escape", "Escape", 27);
  await native.until(
    () => native.evaluate("!document.querySelector('.content-search-panel')"),
    "Search panel did not close",
  );
}
async function sidebarDiagnostic(native) {
  const dom = () =>
    native.evaluate(
      "({nodes:document.querySelectorAll('*').length,sidebarNodes:document.querySelector('#sidebar').querySelectorAll('*').length,tabStops:[...document.querySelectorAll('button,input,textarea,a[href],[tabindex]')].filter(node=>node.tabIndex>=0&&!node.disabled&&node.getClientRects().length).length})",
    );
  const result = {
    purpose:
      "Existing sidebar toggle isolates list DOM/handlers. Forced GC is a separate diagnostic; private allocation retained by Blink/allocator is not evidence of a live DOM leak.",
  };
  result.expandedNatural = { memory: await native.memory(), dom: await dom() };
  result.expandedForcedGcDiagnostic = await native.gc();
  await native.evaluate(
    "document.querySelector('button[aria-label=\"Collapse sidebar\"]').click()",
  );
  await native.until(
    () => native.evaluate("!!document.querySelector('button[aria-label=\"Expand sidebar\"]')"),
    "Sidebar did not collapse",
  );
  await pause(1000);
  result.collapsedNatural = { memory: await native.memory(), dom: await dom() };
  result.collapsedForcedGcDiagnostic = await native.gc();
  await native.evaluate("document.querySelector('button[aria-label=\"Expand sidebar\"]').click()");
  await native.until(
    () => native.evaluate("!!document.querySelector('button[aria-label=\"Collapse sidebar\"]')"),
    "Sidebar did not expand",
  );
  await pause(1000);
  result.expandedAgainNatural = { memory: await native.memory(), dom: await dom() };
  result.expandedAgainForcedGcDiagnostic = await native.gc();
  return result;
}
async function helperCorrectness(native) {
  const results = await native.evaluate(`(async()=>{
    const {searchNoteContent,searchOpenNotes}=window.__quillpaneContentSearchProfileHelper, checks=[];
    const test=(name,condition,details)=>{checks.push({name,passed:!!condition,details});};
    const source='İstanbul 🔎\\r\\nCAFÉ 𐐀 note\\rnext note';
    const expected=[['café',[[13,17,2,1]]],['𐐨',[[18,20,2,6]]],['note',[[21,25,2,9],[31,35,3,6]]]];
    for(const [query,oracle]of expected){const r=searchNoteContent(source,query);test('Unicode/CRLF '+query,JSON.stringify(r.matches.map(m=>[m.start,m.end,m.line,m.column]))===JSON.stringify(oracle),r);}
    const across='line\\r\\n'.repeat(5460)+'xxxcross-window\\n𐐀cross-window';const cross=searchNoteContent(across,'cross-window');test('Chunk overlap exact coordinates',JSON.stringify(cross.matches.map(m=>[m.start,m.end,m.line,m.column]))===JSON.stringify([[32763,32775,5461,4],[32778,32790,5462,3]]),cross);
    const astral=searchNoteContent('x'.repeat(32767)+'𐐀','𐐨');test('Astral boundary casefold',astral.matches[0]?.start===32767&&astral.matches[0]?.end===32769,astral);
    const literal='q'.repeat(256),wide=searchNoteContent('x'.repeat(1000)+literal+'tail',literal),fullSpan=${highlightPolicy === "full-span"};test('256-char literal source selection and declared highlight policy',wide.matches[0]?.text.length===256&&(fullSpan?wide.matches[0]?.snippet.length<=330&&wide.matches[0]?.snippet.slice(wide.matches[0]?.highlightStart,wide.matches[0]?.highlightEnd)===literal:wide.matches[0]?.snippet.length<=163&&wide.matches[0]?.highlightEnd<=wide.matches[0]?.snippet.length),wide);
    for(const count of [300,301,1000]){const r=await searchOpenNotes(Array.from({length:count},(_,i)=>({id:String(i),title:String(i),content:'needle'})),'needle');test('300 result cap '+count,r.matches.length===300&&r.truncated===(count>300)&&r.matches[299].noteId==='299',{count:r.matches.length,truncated:r.truncated,lastNote:r.matches.at(-1).noteId});}
    const order=await searchOpenNotes([{id:'fuzzy',title:'fuzzy',content:'orcherd'},{id:'exact',title:'exact',content:'orchard'}],'orchard',{fuzzy:true,limit:1});test('Exact precedes earlier fuzzy',order.matches[0]?.noteId==='exact'&&order.matches[0]?.fuzzy===false,order);
    const hard=await searchOpenNotes([{id:'all',title:'all',content:'needle '.repeat(600)}],'needle',{limit:10000});test('Hard result cap500',hard.matches.length===500&&hard.truncated,{count:hard.matches.length,truncated:hard.truncated});
    return checks;
  })()`);
  report.correctness.push(...results);
  if (results.some((value) => !value.passed)) throw Error("Helper correctness oracle failed");
}
async function runHelper(native, scenario) {
  const times = scenario.sizes.reduce((sum, size) => sum + size, 0) >= 8 * Mi ? 10 : 30;
  await native.evaluate(
    `window.__quillpaneProfileNotes=${JSON.stringify(scenario.sizes)}.map((size,index)=>({id:String(index),title:'Scale '+index,content:(${fixtureContent.toString()})(size,index,${!!scenario.escaped},${!!scenario.varied},${!!scenario.boundary})}))`,
  );
  const records = [];
  for (const [caseId, query, fuzzy] of queryCases(scenario)) {
    const measured = await sampled(native, () =>
      native.evaluate(
        `(async()=>{const search=window.__quillpaneContentSearchProfileHelper.searchOpenNotes,notes=window.__quillpaneProfileNotes,query=${JSON.stringify(query)},options={fuzzy:${fuzzy}},times=[];for(let i=0;i<3;i++)await search(notes,query,options);let result;for(let i=0;i<${times};i++){const start=performance.now();result=await search(notes,query,options);times.push(performance.now()-start);}const sorted=[...times].sort((a,b)=>a-b);return{times,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],matches:result.matches.length,truncated:result.truncated,cancelled:result.cancelled};})()`,
      ),
    );
    const record = {
      scenario: scenario.id,
      case: caseId,
      notes: scenario.sizes.length,
      utf16Units: scenario.sizes.reduce((sum, size) => sum + size, 0),
      warmups: 3,
      samples: times,
      ...measured.value,
      measurement: measurementSummary(measured),
    };
    report.helper.push(record);
    records.push(record);
    await save();
    console.log(
      JSON.stringify({
        stage: "helper",
        scenario: scenario.id,
        case: caseId,
        medianMs: record.medianMs,
        p95Ms: record.p95Ms,
      }),
    );
  }
  if (scenario.id === "cap16") {
    const cancellation = await native.evaluate(
      `(async()=>{const controller=new AbortController(),start=performance.now();let abortAt;const pending=window.__quillpaneContentSearchProfileHelper.searchOpenNotes(window.__quillpaneProfileNotes,'nonexistent',{fuzzy:true,signal:controller.signal});setTimeout(()=>{abortAt=performance.now();controller.abort();},0);const r=await pending;return{cancelled:r.cancelled,abortAtMs:abortAt-start,settledAtMs:performance.now()-start};})()`,
    );
    report.helperCancellation = cancellation;
    await cpuProfile(native, "helper-cap16-fuzzy-miss", () =>
      native.evaluate(
        "window.__quillpaneContentSearchProfileHelper.searchOpenNotes(window.__quillpaneProfileNotes,'nonexistent',{fuzzy:true}).then(r=>({matches:r.matches.length}))",
      ),
    );
  }
  await native.evaluate("delete window.__quillpaneProfileNotes");
  return records;
}
async function runNative(scenario) {
  const fixtures = await fixture(scenario),
    native = await launch(fixtures);
  const result = {
    scenario: scenario.id,
    profile: fixtures.profile,
    notes: fixtures.documents.length,
    totalUtf16Units: fixtures.totalUnits,
    expectedSearchedNotes: fixtures.included,
    expectedSearchedUnits: fixtures.searchedUnits,
    includedNoteIDs: fixtures.includedIdentities.map((identity) => identity.id),
    omittedNotes: fixtures.omitted,
    identities: fixtures.identities,
    cycles: [],
    queries: [],
    screenshots: [],
    processIDs: native.processIDs,
    checks: [],
  };
  report.native.push(result);
  try {
    if (scenario.markdown) {
      await native.call("Emulation.setDeviceMetricsOverride", {
        width: 700,
        height: 760,
        deviceScaleFactor: 1,
        mobile: false,
      });
    }
    await native.evaluate(watchSource);
    result.baselineNatural = await native.memory();
    result.baselineForcedGcDiagnostic = await native.gc();
    const open = await sampled(native, () => openPanel(native));
    result.coldOpen = { ...open.value, measurement: measurementSummary(open) };
    result.snapshotReady = await native.memory();
    const declared = await native.evaluate(
      "({summary:document.querySelector('.content-search-summary').textContent,notices:[...document.querySelectorAll('.content-search-empty')].map(n=>n.textContent)})",
    );
    if (!declared.summary.includes(`${fixtures.included} open text`))
      throw Error(`Unexpected snapshot scope: ${declared.summary}`);
    result.checks.push("Native snapshot declares the exact bounded note count");
    result.snapshotDeclaration = declared;
    if (fixtures.omitted.length) {
      if (
        !declared.notices.some(
          (text) =>
            text.includes("memory limit") && text.includes(`${fixtures.omitted.length} open note`),
        )
      )
        throw Error("Missing exact snapshot omission notice");
      result.checks.push("Memory-cap omission count is explicit");
    }
    for (const [caseId, query, fuzzy] of queryCases(scenario)) {
      const checked = await native.evaluate(
        "document.querySelector('.content-search-options input').checked",
      );
      if (checked !== fuzzy) {
        await native.evaluate("document.querySelector('.content-search-options input').click()");
        await pause(100);
      }
      const measured = await sampled(native, () => queryPanel(native, query));
      const highlights = await native.evaluate(
        "[...document.querySelectorAll('.content-search-result')].map(button=>({title:button.getAttribute('aria-label'),mark:button.querySelector('mark')?.textContent,text:button.textContent}))",
      );
      const denseCount = fixtures.includedIdentities.reduce((sum, identity) => {
        const index = Number(identity.id.slice(6));
        return (
          sum +
          fixtureContent(
            identity.utf16Units,
            index,
            scenario.escaped,
            scenario.varied,
            scenario.boundary,
            scenario.worstJson,
            scenario.horizontal,
          ).split("ordinary").length -
          1
        );
      }, 0);
      const expectedCount =
        caseId === "missing" || caseId === "typoMissing"
          ? 0
          : caseId === "dense"
            ? Math.min(300, denseCount)
            : Math.min(300, fixtures.included);
      if (highlights.length !== expectedCount)
        throw Error(
          `Incorrect ${caseId} native count ${highlights.length}; expected ${expectedCount}`,
        );
      const expectedMark =
        caseId === "sparse" ? "rare-milestone" : caseId === "dense" ? "ordinary" : "milestone";
      if (
        highlights.some(
          (value) => value.mark !== expectedMark || !/line \d+, column \d+/.test(value.title),
        )
      )
        throw Error(`Incorrect highlighted source/coordinates for ${caseId}`);
      validateHighlights(scenario, caseId, highlights);
      result.queries.push({
        case: caseId,
        query,
        fuzzy,
        ...measured.value,
        measurement: measurementSummary(measured),
        highlightCount: highlights.length,
        firstHighlight: highlights[0],
        lastHighlight: highlights.at(-1),
      });
      result.checks.push(
        `${caseId}: every rendered match highlights exact source with oracle-verified line/column`,
      );
      await save();
    }
    if (fixtures.omitted.length) {
      await native.evaluate(
        "document.querySelector('.content-search-options input').checked&&document.querySelector('.content-search-options input').click()",
      );
      for (const identity of fixtures.omitted.length === 1
        ? fixtures.omitted
        : [fixtures.omitted[0], fixtures.omitted.at(-1)]) {
        const query = await queryPanel(native, identity.marker);
        if (query.resultCount !== 0)
          throw Error(`An omitted note unexpectedly appeared: ${identity.title}`);
        result.checks.push(`Omitted note remains excluded and labelled: ${identity.title}`);
      }
      result.screenshots.push(await native.screenshot(`${scenario.id}-limit-notice`));
    }
    if (scenario.id.startsWith("many1000") || scenario.id === "cap16") {
      await native.evaluate(
        "document.querySelector('.content-search-options input').checked&&document.querySelector('.content-search-options input').click()",
      );
      const query = "rare-milestone";
      await native.evaluate(
        "(()=>{const input=document.querySelector('input[aria-label=\"Search open notes\"]');input.focus();input.select();})()",
      );
      const typingStart = performance.now();
      for (const character of query) {
        await native.call("Input.insertText", { text: character });
        await pause(20);
      }
      await native.until(
        () =>
          native.evaluate(
            `document.querySelector('input[aria-label="Search open notes"]').value===${JSON.stringify(query)}&&document.querySelector('.content-search-results').getAttribute('aria-busy')==='false'&&document.querySelectorAll('.content-search-result').length===${Math.min(300, fixtures.included)}`,
          ),
        "Incremental query did not settle",
      );
      result.incrementalTyping = {
        characters: query.length,
        intervalMs: 20,
        elapsedControllerMs: performance.now() - typingStart,
        settledCount: Math.min(300, fixtures.included),
      };
      result.checks.push("Incremental native typing ends in only the latest query results");
      result.screenshots.push(await native.screenshot(`${scenario.id}-results`));
      await native.evaluate("document.querySelector('.content-search-options input').click()");
      await native.evaluate(
        "(()=>{const input=document.querySelector('input[aria-label=\"Search open notes\"]');input.focus();input.select();})()",
      );
      await native.call("Input.insertText", { text: "nonexistent" });
      await pause(110);
      const replaced = await queryPanel(native, "rare-milestone");
      if (replaced.resultCount !== Math.min(300, fixtures.included))
        throw Error("Superseded fuzzy query replaced the latest results");
      result.supersededFuzzyQuery = replaced;
      result.checks.push("Replacing an in-flight fuzzy query keeps the final results fresh");
    }
    await closePanel(native);
    await pause(500);
    result.closedNatural500ms = await native.memory();
    await pause(500);
    result.closedNatural1000ms = await native.memory();
    result.closedForcedGcDiagnostic = await native.gc();
    // Repeat equivalent open/search/close points to expose continuing retention.
    const cycles =
      scenario.id.startsWith("many1000") || ["cap16", "oversizedDraft"].includes(scenario.id)
        ? 5
        : 2;
    for (let cycle = 0; cycle < cycles; cycle++) {
      const measured = await sampled(native, async () => {
        const opening = await openPanel(native),
          query = await queryPanel(native, "rare-milestone");
        return { opening, query };
      });
      await closePanel(native);
      await pause(500);
      result.cycles.push({
        cycle: cycle + 1,
        ...measured.value,
        measurement: measurementSummary(measured),
        closedNatural: await native.memory(),
        closedForcedGcDiagnostic: await native.gc(),
      });
    }
    if (scenario.id.startsWith("many1000")) {
      result.profiledSnapshot = await cpuProfile(native, "native-many1000-snapshot", () =>
        openPanel(native),
      );
      await closePanel(native);
      await openPanel(native);
      await queryPanel(native, "marker000999");
      if (
        (await native.evaluate("document.querySelectorAll('.content-search-result').length")) !== 1
      )
        throw Error("Unique final-note marker was not found among 1000 notes");
      await native.evaluate("document.querySelector('.content-search-result').click()");
      const source = fixtureContent(
          scenario.sizes[999],
          999,
          scenario.escaped,
          scenario.varied,
        ).replace(/\r\n?/g, "\n"),
        expectedStart = source.indexOf("marker000999");
      await native.until(
        () =>
          native.evaluate(
            `(()=>{const editor=document.querySelector('textarea#editor');return editor&&document.querySelector('.document-title')?.textContent.trim()==='Scale 000999.txt'&&editor.selectionStart===${expectedStart}&&editor.selectionEnd===${expectedStart + 12}&&editor.value.slice(editor.selectionStart,editor.selectionEnd)==='marker000999';})()`,
          ),
        "Final-note result did not select exact native source text",
      );
      result.checks.push(
        "Unique result in the 1000th note navigates and selects its exact source offsets",
      );
      result.screenshots.push(await native.screenshot("many1000-final-note-selection"));
      if (scenario.id === "many1000") result.sidebarDiagnostic = await sidebarDiagnostic(native);
    }
    if (scenario.id === "inactiveMultiPage") {
      await openPanel(native);
      const rawContent = fixtureContent(2 * Mi, 1, true, false, true);
      result.pageBoundaryQueries = [];
      for (const [query, sourceText] of [
        ["boundarycross 🧭 café", "boundarycross 🧭 café"],
        ["prefix𐐨packet-boundary", "prefix𐐀packet-boundary"],
        ["𐐨packet-boundary", "𐐀packet-boundary"],
      ]) {
        const measured = await sampled(native, () => queryPanel(native, query));
        const rawStart = rawContent.indexOf(sourceText),
          preceding = rawContent.slice(0, rawStart),
          breaks = [...preceding.matchAll(/\r\n|\r|\n/g)],
          last = breaks.at(-1);
        const line = breaks.length + 1,
          column = rawStart - (last ? last.index + last[0].length : 0) + 1;
        const actual = await native.evaluate(
          "[...document.querySelectorAll('.content-search-result')].map(button=>({title:button.getAttribute('aria-label'),mark:button.querySelector('mark')?.textContent}))",
        );
        if (
          actual.length !== 1 ||
          actual[0].mark !== sourceText ||
          !actual[0].title.includes(`Scale 000001.txt, line ${line}, column ${column}:`)
        )
          throw Error(
            "Multi-page source marker/highlight coordinates differ from original recovery buffer",
          );
        result.pageBoundaryQueries.push({
          query,
          sourceText,
          rawStart,
          rawEnd: rawStart + sourceText.length,
          line,
          column,
          ...measured.value,
          measurement: measurementSummary(measured),
        });
      }
      result.checks.push(
        "Accepted inactive2Mi recovery preserves literal/astral markers across1Mi transport page boundaries",
      );
      await native.evaluate("document.querySelector('.content-search-result').click()");
      const normalized = rawContent.replace(/\r\n?/g, "\n"),
        selectedText = "𐐀packet-boundary",
        expectedStart = normalized.indexOf(selectedText);
      await native.until(
        () =>
          native.evaluate(
            `(()=>{const editor=document.querySelector('textarea#editor');return editor&&document.querySelector('.document-title')?.textContent.trim()==='Scale 000001.txt'&&editor.selectionStart===${expectedStart}&&editor.selectionEnd===${expectedStart + selectedText.length}&&editor.value.slice(editor.selectionStart,editor.selectionEnd)===${JSON.stringify(selectedText)};})()`,
          ),
        "Multi-page astral result did not select exact normalized native source",
      );
      if (fixtures.identities[1].savedBytes !== 2 * Mi)
        throw Error("Saved-file boundary fixture was not exactly2MiB");
      result.checks.push(
        "Maximum2MiB saved-file boundary stays editable; multi-page astral result selects exact recovered source",
      );
      const selectedLine = normalized.slice(0, expectedStart).split("\n").length;
      result.revealedPlainGeometry = await native.evaluate(
        `(()=>{const e=document.querySelector('textarea#editor'),s=getComputedStyle(e),top=(${selectedLine}-1)*parseFloat(s.lineHeight)+parseFloat(s.paddingTop);return{wrap:e.wrap,scrollTop:e.scrollTop,scrollLeft:e.scrollLeft,clientHeight:e.clientHeight,selectedLine:${selectedLine},expectedLineTop:top,lineVerticallyVisible:top>=e.scrollTop&&top+parseFloat(s.lineHeight)<=e.scrollTop+e.clientHeight};})()`,
      );
      if (!result.revealedPlainGeometry.lineVerticallyVisible)
        throw Error("Multi-page plain-text selection is outside its exact hard-line viewport");
      result.checks.push(
        "Recovered plain-text exact selection is visible at its correct hard line",
      );
      result.screenshots.push(await native.screenshot("inactiveMultiPage-source-selection"));
      await native.key("f", "KeyF", 70, 2);
      await native.until(
        () =>
          native.evaluate(
            "document.activeElement?.getAttribute('aria-label')==='Find in current note'",
          ),
        "Large current-note query did not receive focus",
      );
      await native.evaluate("document.querySelector('textarea#editor').scrollTop=0");
      await pause(150);
      const currentFind = await sampled(native, async () => {
        await native.call("Input.insertText", { text: selectedText });
        await native.until(
          () =>
            native.evaluate(
              `(()=>{const e=document.querySelector('textarea#editor'),s=getComputedStyle(e),top=(${selectedLine}-1)*parseFloat(s.lineHeight)+parseFloat(s.paddingTop);return e.selectionStart===${expectedStart}&&e.selectionEnd===${expectedStart + selectedText.length}&&e.value.slice(e.selectionStart,e.selectionEnd)===${JSON.stringify(selectedText)}&&document.activeElement?.getAttribute('aria-label')==='Find in current note'&&top>=e.scrollTop&&top+parseFloat(s.lineHeight)<=e.scrollTop+e.clientHeight;})()`,
            ),
          "Large current-note find did not reveal its exact source while retaining query focus",
        );
      });
      result.currentFindReveal = {
        query: selectedText,
        selectionStart: expectedStart,
        selectionEnd: expectedStart + selectedText.length,
        measurement: measurementSummary(currentFind),
        after: await native.memory(),
      };
      result.checks.push(
        "Large native Ctrl+F reveals the exact source while retaining query focus",
      );
      result.screenshots.push(await native.screenshot("inactiveMultiPage-current-find"));
    }
    if (scenario.markdown) {
      await openPanel(native);
      await queryPanel(native, "rare-milestone");
      await native.evaluate("document.querySelector('.content-search-result').click()");
      const source = fixtureContent(scenario.sizes[0], 0),
        expectedStart = source.indexOf("rare-milestone");
      await native.until(
        () =>
          native.evaluate(
            `(()=>{const e=document.querySelector('textarea#editor');return e&&e.wrap==='soft'&&e.selectionStart===${expectedStart}&&e.selectionEnd===${expectedStart + 14}&&e.value.slice(e.selectionStart,e.selectionEnd)==='rare-milestone';})()`,
          ),
        "Wrapped Markdown did not select its exact distant source match",
      );
      result.wrappedMarkdownGeometry = await native.evaluate(
        "(()=>{const e=document.querySelector('textarea#editor'),s=getComputedStyle(e);return{wrap:e.wrap,whiteSpace:s.whiteSpace,clientWidth:e.clientWidth,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop,lineHeight:s.lineHeight,finalMatchVerticallyVisible:e.scrollTop>=e.scrollHeight-e.clientHeight-2*parseFloat(s.lineHeight)};})()",
      );
      if (!result.wrappedMarkdownGeometry.finalMatchVerticallyVisible)
        throw Error("Wrapped Markdown exact match is selected but outside its final viewport");
      result.checks.push(
        "Narrow wrapped Markdown selects and reveals its distant exact source match",
      );
      result.screenshots.push(await native.screenshot("wrappedMarkdown-distant-match"));
    }
    if (scenario.horizontal) {
      await openPanel(native);
      await queryPanel(native, "rare-milestone");
      await native.evaluate("document.querySelector('.content-search-result').click()");
      const source = fixtureContent(scenario.sizes[0], 0, false, false, false, false, true),
        expectedStart = source.indexOf("rare-milestone");
      await native.until(
        () =>
          native.evaluate(
            `(()=>{const e=document.querySelector('textarea#editor');return e&&e.wrap==='off'&&e.selectionStart===${expectedStart}&&e.selectionEnd===${expectedStart + 14}&&e.value.slice(e.selectionStart,e.selectionEnd)==='rare-milestone'&&e.scrollLeft>0&&e.scrollLeft>=e.scrollWidth-e.clientWidth-500;})()`,
          ),
        "Plain text did not horizontally reveal its exact distant-column match",
      );
      result.horizontalGeometry = await native.evaluate(
        "(()=>{const e=document.querySelector('textarea#editor');return{wrap:e.wrap,scrollLeft:e.scrollLeft,scrollTop:e.scrollTop,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,selectionStart:e.selectionStart,selectionEnd:e.selectionEnd};})()",
      );
      result.checks.push(
        "Plain text selects and horizontally reveals its exact distant-column match",
      );
      result.screenshots.push(await native.screenshot("horizontalPlain-distant-column"));
    }
    result.responsiveness = await native.evaluate(
      "({longTasks:window.__quillpaneProfile.longTasks,timerMaximumGapMs:Math.max(0,...window.__quillpaneProfile.timerGaps),timerSamples:window.__quillpaneProfile.timerGaps.length,inputEvents:window.__quillpaneProfile.queries.length,allNativeInputsTrusted:window.__quillpaneProfile.queries.every(q=>q.trusted)})",
    );
    result.treePrivateSamples = native.privateSamples;
    result.wholeRunSampledTreePrivateMaximumBytes = Math.max(
      ...native.privateSamples.map((sample) => sample.totalPrivateBytes),
    );
    result.wholeRunTreeCpuDeltaSeconds =
      native.privateSamples.at(-1).totalCpuSeconds - native.privateSamples[0].totalCpuSeconds;
    result.wholeRunTreeCpuIntervalMs =
      native.privateSamples.at(-1).utc - native.privateSamples[0].utc;
    result.runtimeExceptions = native.exceptions;
    if (native.exceptions.length) throw Error("Native runtime exceptions occurred");
    for (const identity of fixtures.identities) {
      if (
        hash(await readFile(join(fixtures.profile, "synthetic-notes", identity.title))) !==
        identity.sourceSha256
      )
        throw Error("Profiling changed a saved synthetic source");
    }
    result.checks.push("All saved synthetic source hashes preserved");
    console.log(
      JSON.stringify({
        stage: "native",
        scenario: scenario.id,
        snapshotMs: result.coldOpen.snapshotMs,
        privateSampledMaximumMiB: result.wholeRunSampledTreePrivateMaximumBytes / Mi,
        queryMs: result.queries.map((query) => [query.case, query.inputToResultsMs]),
      }),
    );
  } catch (error) {
    try {
      result.screenshots.push(await native.screenshot(`${scenario.id}-failure`));
    } catch {}
    result.failure = error.stack || error.message;
    report.failures.push({ scenario: scenario.id, error: result.failure });
    throw error;
  } finally {
    await save();
    await native.close();
  }
}

try {
  if (sidebarOnly) {
    const native = await launch(
      await fixture({ id: "sidebarDiagnostic", sizes: Array(1000).fill(1024) }),
    );
    try {
      report.sidebarDiagnostic = await sidebarDiagnostic(native);
    } finally {
      await native.close();
    }
    report.finishedUTC = new Date().toISOString();
    await save();
    console.log(
      JSON.stringify({
        evidence: join(output, "profile.json"),
        diagnostic: "1000-note sidebar collapse/expand",
      }),
    );
  } else {
    // A dedicated small native session hosts helper-only timings without large DOM/sidebar.
    if (!nativeOnly) {
      const helperFixture = await fixture({ id: "helperHost", sizes: [1024] });
      const helperNative = await launch(helperFixture);
      try {
        await helperNative.evaluate(helperSource);
        await helperNative.evaluate(watchSource);
        await helperCorrectness(helperNative);
        await save();
        for (const scenario of scenarios.filter(
          (value) => !["over32", "oversizedDraft", "worstJsonRecovery"].includes(value.id),
        ))
          await runHelper(helperNative, scenario);
        report.helperResponsiveness = await helperNative.evaluate(
          "({longTasks:window.__quillpaneProfile.longTasks,timerMaximumGapMs:Math.max(0,...window.__quillpaneProfile.timerGaps),timerSamples:window.__quillpaneProfile.timerGaps.length})",
        );
      } finally {
        await helperNative.close();
      }
    }
    for (const scenario of scenarios) await runNative(scenario);
    report.finishedUTC = new Date().toISOString();
    await save();
    console.log(
      JSON.stringify({
        evidence: join(output, "profile.json"),
        helperCases: report.helper.length,
        nativeScenarios: report.native.length,
        correctnessChecks: report.correctness.length,
        failures: report.failures.length,
      }),
    );
  }
} catch (error) {
  report.fatalError = error.stack || error.message;
  await save();
  throw error;
}
