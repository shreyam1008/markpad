// Comparison-only dependencies stay in ignored dist/search-scaling-comparison.
// Setup: bun .github/scripts/compare-content-search.ts --setup
// Run: bun build .github/scripts/compare-content-search.ts --target=node
//   --outfile=dist/search-scaling-comparison/compare.mjs
//   node --expose-gc dist/search-scaling-comparison/compare.mjs
// Baseline/alternative source: append --source=path/to/content-search.ts
// Tiny semantic probes only: append --correctness (also builds the Go worker).
// Typo/chunk/adversarial oracle: append --oracle --reference-source=baseline.ts
// Filter a focused run: --engines=current --fixtures=20-normal,eight-large
// Resume completed rows from identical source/reference/harness/environment: --resume
// Run from the repository root, with no concurrent comparison/native profiling.
// Frozen alternative helpers must be self-contained (no relative runtime imports).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { cpus, release } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import type {
  ContentSearchResult,
  OpenNoteSearchMatch,
  SearchableNote,
} from "../../frontend/src/workspace/content-search";

const scratch = resolve("dist/search-scaling-comparison");
const LIMIT = 300;
// The parent freezes a selected source before starting children, so a concurrent
// app edit cannot silently change the engine used by later matrix rows.
let searchOpenNotes: typeof import("../../frontend/src/workspace/content-search").searchOpenNotes;
let referenceSearchOpenNotes: typeof searchOpenNotes;
let searchNoteContent: typeof import("../../frontend/src/workspace/content-search").searchNoteContent;
let referenceSearchNoteContent: typeof searchNoteContent;
async function loadFrozenEngine() {
  ({ searchOpenNotes, searchNoteContent } = await import(
    pathToFileURL(join(scratch, "content-search-engine.mjs")).href
  ));
  ({ searchOpenNotes: referenceSearchOpenNotes, searchNoteContent: referenceSearchNoteContent } =
    await import(pathToFileURL(join(scratch, "content-search-reference.mjs")).href));
}

async function oracleProbes() {
  let checked = 0;
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  for (let length = 4; length <= 64; length++) {
    const query = Array.from(
      { length },
      (_, index) => alphabet[(index * 7) % alphabet.length],
    ).join("");
    for (const position of [0, Math.floor(length / 2), length - 1]) {
      const replacement = query[position] === "x" ? "y" : "x";
      const swap = Math.min(position, length - 2);
      for (const word of [
        query.slice(0, position) + replacement + query.slice(position),
        query.slice(0, position) + query.slice(position + 1),
        query.slice(0, position) + replacement + query.slice(position + 1),
        query.slice(0, swap) + query[swap + 1] + query[swap] + query.slice(swap + 2),
      ]) {
        for (const from of [0, 4095, 32765]) {
          for (const suffix of ["\r\nASCII suffix", "\r\nİ café 🔎 𐐀"]) {
            const content = "!".repeat(from) + word + suffix;
            assert.deepEqual(
              searchNoteContent(content, query, { fuzzy: true }),
              referenceSearchNoteContent(content, query, { fuzzy: true }),
            );
            checked++;
          }
        }
      }
    }
  }
  const adversarial = [];
  for (const [name, content, query] of [
    ["8MiB-long-ASCII-word", "a".repeat(8 * 1024 * 1024), "a".repeat(63) + "b"],
    [
      "128KiB-dense64-word-miss",
      ("a".repeat(64) + "\r\n").repeat(1986),
      "a".repeat(31) + "b" + "a".repeat(31) + "c",
    ],
    ["128KiB-dense64-word-near-cap", ("a".repeat(64) + "\r\n").repeat(1986), "a".repeat(63) + "b"],
  ]) {
    const expected = referenceSearchNoteContent(content, query, { fuzzy: true, limit: LIMIT });
    const started = performance.now();
    const actual = await searchOpenNotes([{ id: "case", title: name, content }], query, {
      fuzzy: true,
      limit: LIMIT,
    });
    const singleProbeMs = performance.now() - started;
    assert.deepEqual(
      actual.matches.map(({ noteId: _id, noteTitle: _title, ...match }) => match),
      expected.matches,
    );
    assert.equal(actual.truncated, expected.truncated);
    adversarial.push({
      name,
      characters: content.length,
      singleProbeMs,
      count: actual.matches.length,
      truncated: actual.truncated,
      matchesOracle: true,
      limitation: "One correctness/latency probe, not a warm benchmark.",
    });
  }
  return { checked, adversarial };
}

async function freezeEngine(argument: string, output: string, fallback: string) {
  const sourceArgument = process.argv.find((value) => value.startsWith(`--${argument}=`));
  const path = resolve(sourceArgument?.slice(`--${argument}=`.length) ?? fallback);
  const contents = await readFile(path);
  const frozenPath = join(scratch, `content-search-${output}.ts`);
  await writeFile(frozenPath, contents);
  const bundled = spawnSync(
    "bun",
    [
      "build",
      frozenPath,
      "--target=node",
      `--outfile=${join(scratch, `content-search-${output}.mjs`)}`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (bundled.status !== 0) throw new Error(bundled.stderr);
  return { path, sha256: createHash("sha256").update(contents).digest("hex") };
}

async function freezeSources() {
  const source = await freezeEngine("source", "engine", "frontend/src/workspace/content-search.ts");
  const reference = await freezeEngine("reference-source", "reference", source.path);
  return { source, reference };
}
const packages = [
  "@leeoniya/ufuzzy@1.0.19",
  "fuse.js@7.5.0",
  "minisearch@7.2.0",
  "flexsearch@0.8.212",
];
const fixtures = [
  { name: "one-tiny", notes: 1, characters: 1_024 },
  { name: "20-tiny", notes: 20, characters: 20 * 1_024 },
  { name: "20-normal", notes: 20, characters: 20 * 32_768 },
  { name: "100-normal", notes: 100, characters: 100 * 32_768 },
  { name: "1000-tiny", notes: 1_000, characters: 1_000 * 1_024 },
  { name: "eight-large", notes: 8, characters: 16 * 1_024 * 1_024 },
  { name: "1000-medium", notes: 1_000, characters: 16 * 1_024 * 1_024 },
];

function corpus(count: number, characters: number): SearchableNote[] {
  const width = Math.floor(characters / count);
  return Array.from({ length: count }, (_, index) => {
    const lines: string[] = [];
    let length = 0;
    for (let line = 0; length < width; line++) {
      // Varied identifiers prevent an unrealistically tiny repeated-word index.
      const text = `Entry${index}_${line} ownership ordinary writing release plan detail${(line * 7919 + index * 104729) % 100003}\r\n`;
      lines.push(text);
      length += text.length;
    }
    const marker = "\r\nretrievalneedle café 🔎 𐐀\r\n";
    return {
      id: String(index),
      title: `Note ${index}`,
      content: lines.join("").slice(0, width - marker.length) + marker,
    };
  });
}

function collectMemory() {
  const memory = process.memoryUsage();
  return {
    heapUsed: memory.heapUsed,
    rss: memory.rss,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
  };
}

async function gc() {
  (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
  await new Promise<void>((finish) => setTimeout(finish, 0));
  (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
}

interface Adapter {
  query(query: string, fuzzy: boolean): Promise<ContentSearchResult<OpenNoteSearchMatch>>;
  update(index: number, content: string): Promise<void>;
  description: string;
  close?(): void;
  nativeMemory?(): Promise<unknown>;
  nativeProcess?(): Promise<{ cpuMs: number } | undefined>;
  nativeEngineMs?(): number;
}

interface FuzzyFilter {
  filter(haystack: string[], query: string): number[] | null;
}
interface MiniIndex {
  addAll(notes: SearchableNote[]): void;
  replace(note: SearchableNote): void;
  search(
    query: string,
    options: { fuzzy: false | number; prefix: boolean; combineWith: string },
  ): { id: string }[];
}

async function adapter(engine: string, notes: SearchableNote[]): Promise<Adapter> {
  if (engine === "current") {
    return {
      description:
        "Selected source helper scan, original UTF-16 source offsets, exact matches first, one whole-word edit, 300 results.",
      query: (query, fuzzy) => searchOpenNotes(notes, query, { fuzzy, limit: LIMIT }),
      update: async (index, content) => {
        notes[index].content = content;
      },
    };
  }
  if (engine === "ufuzzy" || engine === "ufuzzy-bounded") {
    const { default: UFuzzy } = (await import(
      pathToFileURL(join(scratch, "node_modules/@leeoniya/ufuzzy/dist/uFuzzy.mjs")).href
    )) as { default: new (options: object) => FuzzyFilter };
    const common = {
      unicode: true,
      intraSplit: null,
      interSplit: "[^\\p{L}\\p{N}\\p{M}_]+",
      intraChars: "[\\p{L}\\p{N}\\p{M}_]",
      toLower: (value: string) => value.toLowerCase(),
    };
    const exact = new UFuzzy({ ...common, intraIns: 0 });
    const near = new UFuzzy({
      ...common,
      intraMode: 1,
      intraSlice: [0, Infinity],
      intraIns: 1,
      intraSub: 1,
      intraTrn: 1,
      intraDel: 1,
    });
    const haystack = notes.map((note) => note.content);
    return {
      description:
        "Unicode uFuzzy document candidate filter, then selected source verifier for every occurrence/source selection; no index. Non-word query falls back to full scan. A null unsupported filter also falls back. ufuzzy-bounded uses32KiB slices with258-character overlap and cooperative yields; ufuzzy scans whole notes synchronously.",
      query: async (query, fuzzy) => {
        if (!/^[\p{L}\p{N}\p{M}_]+$/u.test(query))
          return searchOpenNotes(notes, query, { fuzzy, limit: LIMIT });
        if (engine === "ufuzzy-bounded") {
          const selected: SearchableNote[] = [];
          let lastYield = performance.now();
          for (const note of notes) {
            for (let from = 0; from < note.content.length; from += 32_768) {
              // Overlap preserves queries and maximum65-code-point near words.
              let to = Math.min(note.content.length, from + 32_768 + 258);
              const code = note.content.charCodeAt(to - 1);
              if (code >= 0xd800 && code <= 0xdbff) to++;
              const block = [note.content.slice(from, to)];
              const literal = exact.filter(block, query);
              const nearHits = fuzzy ? near.filter(block, query) : [];
              if (literal === null || nearHits === null)
                return searchOpenNotes(notes, query, { fuzzy, limit: LIMIT });
              if (literal.length || nearHits.length) {
                selected.push(note);
                break;
              }
              if (performance.now() - lastYield >= 8) {
                await new Promise<void>((finish) => setTimeout(finish, 0));
                lastYield = performance.now();
              }
            }
          }
          return searchOpenNotes(selected, query, { fuzzy, limit: LIMIT });
        }
        const found = exact.filter(haystack, query);
        if (found === null) return searchOpenNotes(notes, query, { fuzzy, limit: LIMIT });
        const indices = new Set(found);
        if (fuzzy) {
          const more = near.filter(haystack, query);
          if (more === null) return searchOpenNotes(notes, query, { fuzzy, limit: LIMIT });
          for (const index of more) indices.add(index);
        }
        return searchOpenNotes(
          notes.filter((_, index) => indices.has(index)),
          query,
          { fuzzy, limit: LIMIT },
        );
      },
      update: async (index, content) => {
        notes[index].content = content;
        haystack[index] = content;
      },
    };
  }
  if (engine === "minisearch") {
    const { default: MiniSearch } = (await import(
      pathToFileURL(join(scratch, "node_modules/minisearch/dist/es/index.js")).href
    )) as { default: new (options: object) => MiniIndex };
    const index = new MiniSearch({ fields: ["content"] });
    index.addAll(notes);
    return {
      description:
        "Word-token MiniSearch candidate index plus selected source verifier. Deliberately NOT literal-substring equivalent: interior substrings miss; indexed query results can require extra source scanning. One edit request maps to term edit-distance; swap semantics differ.",
      query: async (query, fuzzy) => {
        const ids = new Set(
          index
            .search(query, { fuzzy: fuzzy ? 1 : false, prefix: false, combineWith: "AND" })
            .map((hit) => String(hit.id)),
        );
        return searchOpenNotes(
          notes.filter((note) => ids.has(note.id)),
          query,
          { fuzzy, limit: LIMIT },
        );
      },
      update: async (position, content) => {
        notes[position].content = content;
        index.replace(notes[position]);
      },
    };
  }
  if (engine === "go") return goAdapter(notes);
  if (engine === "ripgrep") return ripgrepAdapter(notes);
  throw new Error(`Unknown engine ${engine}`);
}

function boundedSnippet(content: string, start: number, end: number) {
  const safe = (position: number) => {
    const before = content.charCodeAt(position - 1);
    const after = content.charCodeAt(position);
    return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
      ? position + 1
      : position;
  };
  const from = safe(Math.max(0, start - 48));
  const to = Math.min(content.length, safe(from + 160));
  const prefix = from ? "…" : "";
  return {
    snippet:
      prefix + content.slice(from, to).replace(/[\r\n\t]/g, " ") + (to < content.length ? "…" : ""),
    highlightStart: prefix.length + start - from,
    highlightEnd: prefix.length + Math.min(end, to) - from,
  };
}

function ripgrepAdapter(notes: SearchableNote[]): Adapter {
  let input: Buffer;
  let starts: number[];
  const prepare = () => {
    starts = [];
    let offset = 0;
    for (const note of notes) {
      starts.push(offset);
      offset += Buffer.byteLength(note.content) + 1;
    }
    input = Buffer.from(notes.map((note) => note.content).join("\n"));
  };
  prepare();
  return {
    description:
      "ripgrep --json -F -i over identical live UTF8 stdin; spawn, pipe transport, output parsing, original note identity/source conversion included. max-count301 limits matching lines (not individual occurrences); parser caps300 matches and detects the next. Exact single-line queries only. CLI process CPU/peak memory is not measured on this Windows harness. Input buffer retained/prepared outside warm query; source load and update cost measured separately.",
    update: async (index, content) => {
      notes[index].content = content;
      prepare();
    },
    query: async (query, fuzzy) => {
      if (fuzzy || query.includes("\n"))
        throw new Error("ripgrep contender only supports exact single-line queries");
      const output = await new Promise<string>((finish, reject) => {
        const child = spawn(
          process.env.SEARCH_BENCH_RG ?? "rg",
          ["--json", "--text", "-F", "-i", "--max-count=301", "--", query, "-"],
          { stdio: "pipe", windowsHide: true },
        );
        let text = "";
        let error = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          text += chunk;
        });
        child.stderr.on("data", (chunk: Buffer) => {
          error += chunk.toString();
        });
        child.on("error", reject);
        child.stdin.on("error", (failure: NodeJS.ErrnoException) => {
          // rg closes stdin when its matching-line cap is reached. Windows may
          // report EOF instead of POSIX EPIPE; the exit code still decides success.
          if (failure.code !== "EPIPE" && failure.code !== "EOF") reject(failure);
        });
        child.on("close", (code) =>
          code === 0 || code === 1 ? finish(text) : reject(new Error(error)),
        );
        child.stdin.end(input);
      });
      const matches: OpenNoteSearchMatch[] = [];
      let noteIndex = 0;
      let byteCursor = 0;
      let offset = 0;
      let line = 1;
      let lineStart = 0;
      const advance = (byteEnd: number) => {
        const skipped = input.subarray(byteCursor, byteEnd).toString("utf8");
        for (let index = 0; index < skipped.length; index++) {
          const character = skipped.charCodeAt(index);
          if (
            character === 13 ||
            (character === 10 && notes[noteIndex].content.charCodeAt(offset + index - 1) !== 13)
          ) {
            line++;
            lineStart = offset + index + 1;
          } else if (character === 10) lineStart = offset + index + 1;
        }
        offset += skipped.length;
        byteCursor = byteEnd;
      };
      for (const row of output.split("\n")) {
        if (!row) continue;
        const entry = JSON.parse(row);
        if (entry.type !== "match") continue;
        for (const part of entry.data.submatches) {
          const byteStart = entry.data.absolute_offset + part.start;
          const byteEnd = entry.data.absolute_offset + part.end;
          while (noteIndex + 1 < starts.length && starts[noteIndex + 1] <= byteStart) {
            noteIndex++;
            byteCursor = starts[noteIndex];
            offset = 0;
            line = 1;
            lineStart = 0;
          }
          if (matches.length === LIMIT)
            return { matches, truncated: true, cancelled: false, queryTooLong: false };
          advance(byteStart);
          const start = offset;
          const column = start - lineStart + 1;
          const startLine = line;
          advance(byteEnd);
          const note = notes[noteIndex];
          const end = offset;
          matches.push({
            noteId: note.id,
            noteTitle: note.title,
            start,
            end,
            text: note.content.slice(start, end),
            line: startLine,
            column,
            ...boundedSnippet(note.content, start, end),
            fuzzy: false,
          });
        }
      }
      return { matches, truncated: false, cancelled: false, queryTooLong: false };
    },
  };
}

const goSource = String.raw`package main
import("bufio";"encoding/json";"os";"regexp";"runtime";"strings";"time";"unicode/utf8")
type Note struct{ ID,Title,Content string }
type Request struct{ Op,Query,Content string; Notes []Note; Index,Limit int }
type Match struct{ NoteID,NoteTitle,Text,Snippet string; Start,End,Line,Column,HighlightStart,HighlightEnd int; Fuzzy bool }
func main(){
 reader:=bufio.NewReaderSize(os.Stdin,65536); writer:=bufio.NewWriter(os.Stdout); var notes []Note
 send:=func(value any){ bytes,_:=json.Marshal(value);writer.Write(bytes);writer.WriteByte(10);writer.Flush() }
 send(map[string]any{"Ready":true})
 for { line,err:=reader.ReadBytes(10);if err!=nil{return};var req Request;if err=json.Unmarshal(line,&req);err!=nil{send(map[string]any{"Error":err.Error()});continue};started:=time.Now()
 if req.Op=="load"{notes=req.Notes;runtime.GC();var mem runtime.MemStats;runtime.ReadMemStats(&mem);send(map[string]any{"HeapAlloc":mem.HeapAlloc,"HeapInuse":mem.HeapInuse,"EngineMS":float64(time.Since(started).Microseconds())/1000});continue}
 if req.Op=="update"{notes[req.Index].Content=req.Content;send(map[string]any{"EngineMS":float64(time.Since(started).Microseconds())/1000});continue}
 if req.Op=="memory"{runtime.GC();var mem runtime.MemStats;runtime.ReadMemStats(&mem);send(map[string]any{"HeapAlloc":mem.HeapAlloc,"HeapInuse":mem.HeapInuse});continue}
 matches:=make([]Match,0);truncated:=false;pattern,err:=regexp.Compile("(?i)"+regexp.QuoteMeta(req.Query));if err!=nil{send(map[string]any{"Error":err.Error()});continue}
 outer:for _,note:=range notes{cursor,u16,lineNo,lineStart,lastCR:=0,0,1,0,false
 advance:=func(end int){for cursor<end{r,width:=utf8.DecodeRuneInString(note.Content[cursor:]);cursor+=width;if r>0xffff{u16+=2}else{u16++};if r==13{lineNo++;lineStart=u16;lastCR=true}else if r==10{if !lastCR{lineNo++};lineStart=u16;lastCR=false}else{lastCR=false}}}
 for after:=0;after<len(note.Content);{offset:=pattern.FindStringIndex(note.Content[after:]);if offset==nil{break};start,end:=after+offset[0],after+offset[1];after=end;if len(matches)==req.Limit{truncated=true;break outer};advance(start);startU16,column,startLine:=u16,u16-lineStart+1,lineNo;advance(end)
 // Bounded source snippet, preserving control-code-unit offsets. ASCII fixtures use the same48-before/160-window contract; Unicode source offsets are verified separately.
 snippetStart:=start-48;if snippetStart<0{snippetStart=0};for snippetStart>0&&!utf8.RuneStart(note.Content[snippetStart]){snippetStart--};snippetEnd:=snippetStart+160;if snippetEnd>len(note.Content){snippetEnd=len(note.Content)};for snippetEnd<len(note.Content)&&!utf8.RuneStart(note.Content[snippetEnd]){snippetEnd++}
 prefix,suffix:="","";if snippetStart>0{prefix="…"};if snippetEnd<len(note.Content){suffix="…"};raw:=note.Content[snippetStart:snippetEnd];replacer:=strings.NewReplacer("\r"," ","\n"," ","\t"," ");count:=func(s string)int{n:=0;for _,r:=range s{if r>0xffff{n+=2}else{n++}};return n};highlightEnd:=end;if highlightEnd>snippetEnd{highlightEnd=snippetEnd};matches=append(matches,Match{NoteID:note.ID,NoteTitle:note.Title,Text:note.Content[start:end],Snippet:prefix+replacer.Replace(raw)+suffix,Start:startU16,End:u16,Line:startLine,Column:column,HighlightStart:count(prefix)+count(note.Content[snippetStart:start]),HighlightEnd:count(prefix)+count(note.Content[snippetStart:highlightEnd])})
 }}
 send(map[string]any{"Matches":matches,"Truncated":truncated,"EngineMS":float64(time.Since(started).Microseconds())/1000})
 }
}
`;

async function compileGo() {
  const tool = toolAvailability("go", ["version"]);
  if (!tool.available) return tool;
  await writeFile(join(scratch, "search-go.go"), goSource);
  const compiled = spawnSync(
    "go",
    [
      "build",
      "-trimpath",
      "-ldflags=-s -w",
      "-o",
      join(scratch, process.platform === "win32" ? "search-go.exe" : "search-go"),
      join(scratch, "search-go.go"),
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (compiled.status !== 0) throw new Error(compiled.stderr);
  return tool;
}

function toolAvailability(command: string, versionArguments: string[]) {
  if (command === "none") return { available: false, reason: "Disabled by SEARCH_BENCH_RG=none." };
  const probe = spawnSync(command, versionArguments, { encoding: "utf8", windowsHide: true });
  return probe.status === 0
    ? { available: true, version: probe.stdout.trim().split(/\r?\n/)[0] }
    : {
        available: false,
        reason: probe.error?.message || probe.stderr.trim() || `Exit status ${probe.status}`,
      };
}

async function windowsProcess(pid: number) {
  if (process.platform !== "win32") return undefined;
  const measured = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `$comparisonProcess = Get-Process -Id ${pid}; [pscustomobject]@{privateCommitted=$comparisonProcess.PrivateMemorySize64;workingSet=$comparisonProcess.WorkingSet64;cpuMs=$comparisonProcess.TotalProcessorTime.TotalMilliseconds} | ConvertTo-Json -Compress`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  return measured.status === 0 ? JSON.parse(measured.stdout) : undefined;
}

async function goAdapter(notes: SearchableNote[]): Promise<Adapter> {
  const child = spawn(
    join(scratch, process.platform === "win32" ? "search-go.exe" : "search-go"),
    [],
    { windowsHide: true, stdio: "pipe" },
  );
  let buffer = "";
  const replies: ((value: Record<string, unknown>) => void)[] = [];
  const waitForReply = () => new Promise<Record<string, unknown>>((finish) => replies.push(finish));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const value = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      replies.shift()?.(value);
    }
  });
  await waitForReply();
  const request = async (value: object) => {
    const reply = waitForReply();
    child.stdin.write(JSON.stringify(value) + "\n");
    const result = await reply;
    if (result.Error) throw new Error(String(result.Error));
    return result;
  };
  await request({ Op: "load", Notes: notes });
  let engineMs = 0;
  return {
    description:
      "Resident native Go stdlib (?i) literal regexp; each query includes stdio JSON IPC and UTF-8→UTF-16 result conversion. Snapshot load/update costs are measured separately. Exact only; no typo implementation. Snippet context uses bounded UTF-8 bytes rather than exactly the JS160-code-unit context.",
    query: async (query, fuzzy) => {
      if (fuzzy) throw new Error("Native Go contender is exact-only");
      const response = await request({ Op: "query", Query: query, Limit: LIMIT });
      engineMs = response.EngineMS as number;
      const matches = (response.Matches as Record<string, unknown>[]).map((value) => ({
        noteId: value.NoteID as string,
        noteTitle: value.NoteTitle as string,
        start: value.Start as number,
        end: value.End as number,
        line: value.Line as number,
        column: value.Column as number,
        text: value.Text as string,
        snippet: value.Snippet as string,
        highlightStart: value.HighlightStart as number,
        highlightEnd: value.HighlightEnd as number,
        fuzzy: false,
      }));
      return {
        matches,
        truncated: response.Truncated as boolean,
        cancelled: false,
        queryTooLong: false,
      };
    },
    update: async (index, content) => {
      notes[index].content = content;
      await request({ Op: "update", Index: index, Content: content });
    },
    nativeMemory: async () => ({
      goHeap: await request({ Op: "memory" }),
      process: await windowsProcess(child.pid!),
    }),
    nativeProcess: () => windowsProcess(child.pid!),
    nativeEngineMs: () => engineMs,
    close: () => child.kill(),
  };
}

async function measure(
  run: () => Promise<ContentSearchResult<OpenNoteSearchMatch>>,
  samples: number,
  candidate?: Adapter,
) {
  for (let warmup = 0; warmup < 2; warmup++) await run();
  const durations: number[] = [];
  const engineDurations: number[] = [];
  const nativeBefore = await candidate?.nativeProcess?.();
  const cpu = process.cpuUsage();
  const before = collectMemory();
  let maxObserved = before.heapUsed;
  let count = 0;
  let truncated = false;
  for (let iteration = 0; iteration < samples; iteration++) {
    const start = performance.now();
    const result = await run();
    durations.push(performance.now() - start);
    if (candidate?.nativeEngineMs) engineDurations.push(candidate.nativeEngineMs());
    count = result.matches.length;
    truncated = result.truncated;
    maxObserved = Math.max(maxObserved, collectMemory().heapUsed);
  }
  const used = process.cpuUsage(cpu);
  const nativeAfter = await candidate?.nativeProcess?.();
  durations.sort((left, right) => left - right);
  engineDurations.sort((left, right) => left - right);
  await gc();
  return {
    medianMs: durations[Math.floor(samples / 2)],
    p95Ms: durations[Math.ceil(samples * 0.95) - 1],
    meanCpuMs: (used.user + used.system) / 1000 / samples,
    meanNativeCpuMs:
      nativeBefore && nativeAfter ? (nativeAfter.cpuMs - nativeBefore.cpuMs) / samples : undefined,
    nativeEngineMedianMs: engineDurations.length
      ? engineDurations[Math.floor(samples / 2)]
      : undefined,
    samples,
    count,
    truncated,
    maxObservedHeapUsed: maxObserved,
    retainedMemory: collectMemory(),
  };
}

// An independent diagnostic, outside query samples. Timer lateness is a coarse
// event-loop responsiveness proxy; it includes timer scheduling jitter.
async function eventLoopLateness(run: () => Promise<unknown>) {
  let active = true;
  let maximum = 0;
  let previous = performance.now();
  const finished = new Promise<void>((finish) => {
    const tick = () => {
      const now = performance.now();
      maximum = Math.max(maximum, now - previous - 1);
      previous = now;
      if (active) setTimeout(tick, 1);
      else finish();
    };
    setTimeout(tick, 1);
  });
  await run();
  active = false;
  await finished;
  return maximum;
}

function exactExistence(notes: SearchableNote[], query: string) {
  // Diagnostic only: no source locations/snippets, result collection or yielding.
  // This isolates engine scan cost and cannot replace the full search contract.
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu");
  let count = 0;
  for (const note of notes) if (expression.test(note.content)) count++;
  return count;
}

function signature(result: ContentSearchResult<OpenNoteSearchMatch>) {
  return JSON.stringify({
    matches: result.matches.map(({ noteId, start, end, line, column, text, fuzzy }) => ({
      noteId,
      start,
      end,
      line,
      column,
      text,
      fuzzy,
    })),
    truncated: result.truncated,
  });
}

async function childRun(engine: string, count: number, characters: number) {
  await gc();
  const baseline = collectMemory();
  const sourceStart = performance.now();
  const notes = corpus(count, characters);
  // Materialize strings before attributing index memory/build costs.
  for (const note of notes) Buffer.byteLength(note.content);
  const sourceBuildMs = performance.now() - sourceStart;
  await gc();
  const sourceMemory = collectMemory();
  const buildStart = performance.now();
  const candidate = await adapter(engine, notes);
  const buildMs = performance.now() - buildStart;
  await gc();
  const indexedMemory = collectMemory();
  const nativeBefore = await candidate.nativeMemory?.();
  const queries = [
    { name: "sparse-exact", query: "retrievalneedle", fuzzy: false },
    { name: "interior-substring", query: "trievalneed", fuzzy: false },
    { name: "missing-exact", query: "unmatchedcontent", fuzzy: false },
    { name: "common-exact", query: "ordinary", fuzzy: false },
    { name: "typo", query: "owenrship", fuzzy: true },
    { name: "fuzzy-missing", query: "unmatchedcontent", fuzzy: true },
  ];
  const measurements = [];
  for (const query of queries) {
    if ((engine === "go" || engine === "ripgrep") && query.fuzzy) continue;
    const expected = await referenceSearchOpenNotes(notes, query.query, {
      fuzzy: query.fuzzy,
      limit: LIMIT,
    });
    const actual = await candidate.query(query.query, query.fuzzy);
    const exactResultContract = signature(expected) === signature(actual);
    const measurement = await measure(
      () => candidate.query(query.query, query.fuzzy),
      characters >= 8 * 1024 * 1024 ? 5 : 9,
      candidate,
    );
    measurements.push({
      ...query,
      ...measurement,
      exactResultContract,
      expectedCount: expected.matches.length,
      maximumTimerLatenessMs: await eventLoopLateness(() =>
        candidate.query(query.query, query.fuzzy),
      ),
    });
  }
  const updateSource = notes[Math.floor(count / 2)].content.replace(
    "retrievalneedle",
    "updatedneedle",
  );
  const updateStart = performance.now();
  await candidate.update(Math.floor(count / 2), updateSource);
  const updateMs = performance.now() - updateStart;
  const fresh = await candidate.query("updatedneedle", false);
  assert.equal(
    fresh.matches.some((match) => match.noteId === String(Math.floor(count / 2))),
    true,
  );
  const nativeAfter = await candidate.nativeMemory?.();
  let existenceOnlyDiagnostic;
  if (engine === "current") {
    const start = performance.now();
    let hits = 0;
    for (let sample = 0; sample < 5; sample++) hits += exactExistence(notes, "unmatchedcontent");
    existenceOnlyDiagnostic = {
      meanMs: (performance.now() - start) / 5,
      hits,
      warning:
        "Non-cooperative existence-only regexp scan. No source locations, snippets, or all-occurrence semantics; diagnostic only.",
    };
  }
  candidate.close?.();
  return {
    engine,
    notes: count,
    characters: notes.reduce((sum, note) => sum + note.content.length, 0),
    description: candidate.description,
    sourceBuildMs,
    buildMs,
    updateMs,
    baseline,
    sourceMemory,
    indexedMemory,
    additionalIndexHeapBytes: indexedMemory.heapUsed - sourceMemory.heapUsed,
    nativeBefore,
    nativeAfter,
    existenceOnlyDiagnostic,
    measurements,
  };
}

async function directoryBytes(path: string): Promise<number> {
  let bytes = 0;
  for (const file of await readdir(path, { withFileTypes: true })) {
    const child = join(path, file.name);
    bytes += file.isDirectory() ? await directoryBytes(child) : (await stat(child)).size;
  }
  return bytes;
}

async function dependencySizes() {
  const sizes = [];
  for (const name of ["@leeoniya/ufuzzy", "fuse.js", "minisearch", "flexsearch"]) {
    const directory = join(scratch, "node_modules", name);
    const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    const entry = join(scratch, `${name.replaceAll("/", "-")}-size.mjs`);
    await writeFile(
      entry,
      `export * from ${JSON.stringify(name)}; export {default} from ${JSON.stringify(name)};\n`,
    );
    if (name === "flexsearch") await writeFile(entry, `export * from "flexsearch";\n`);
    const bundle = join(scratch, `${name.replaceAll("/", "-")}.min.js`);
    const result = spawnSync(
      "bun",
      ["build", entry, "--target=browser", "--minify", `--outfile=${bundle}`],
      { cwd: scratch, encoding: "utf8", windowsHide: true },
    );
    if (result.status !== 0) throw new Error(result.stderr);
    const source = await readFile(bundle);
    sizes.push({
      name,
      version: metadata.version,
      license: metadata.license,
      installedBytes: await directoryBytes(directory),
      minifiedBrowserBytes: source.length,
      gzipBrowserBytes: gzipSync(source).length,
      runtimeNetwork: false,
    });
  }
  return sizes;
}

async function correctnessProbes(unavailable: string[] = []) {
  const notes = [
    {
      id: "unicode",
      title: "Unicode",
      content: "İstanbul 🔎\r\nCAFÉ 𐐀 note\rnext note\nmeeting\nx\n𐐀bcde\nſinging Kelvin Straße",
    },
  ];
  const probes = [];
  for (const engine of ["current", "ufuzzy", "minisearch", "go", "ripgrep"]) {
    if (unavailable.includes(engine)) continue;
    const candidate = await adapter(
      engine,
      notes.map((note) => ({ ...note })),
    );
    for (const query of [
      "café",
      "𐐨",
      "note",
      "eting",
      "nexe note",
      "xeeting",
      "meetign",
      "meetinX",
      "𐐨bcxe",
      "𐐨cbde",
      "singing",
      "kelvin",
      "StraXe",
    ]) {
      const fuzzy = [
        "nexe note",
        "xeeting",
        "meetign",
        "meetinX",
        "𐐨bcxe",
        "𐐨cbde",
        "StraXe",
      ].includes(query);
      if ((engine === "go" || engine === "ripgrep") && fuzzy) continue;
      const expected = await referenceSearchOpenNotes(notes, query, { fuzzy });
      const actual = await candidate.query(query, fuzzy);
      probes.push({
        engine,
        query,
        fuzzy,
        matchesSourceSelections: signature(expected) === signature(actual),
        expected: expected.matches.map(({ start, end, text }) => ({ start, end, text })),
        actual: actual.matches.map(({ start, end, text }) => ({ start, end, text })),
        highlightsSelectSource: actual.matches.every(
          (match) => notes[0].content.slice(match.start, match.end) === match.text,
        ),
      });
    }
    candidate.close?.();
  }
  const { default: Fuse } = (await import(
    pathToFileURL(join(scratch, "node_modules/fuse.js/dist/fuse.mjs")).href
  )) as {
    default: new (
      strings: string[],
      options: object,
    ) => { search(query: string): { matches?: { indices: [number, number][] }[] }[] };
  };
  for (const query of ["café", "note", "𐐨"]) {
    const fuse = new Fuse([notes[0].content], {
      includeMatches: true,
      findAllMatches: true,
      minMatchCharLength: query.length,
      ignoreLocation: true,
      ignoreFieldNorm: true,
      threshold: 0,
    });
    probes.push({
      engine: "fuse-raw",
      query,
      matches: fuse.search(query),
      warning:
        "Raw Fuse indices are tested as returned; Unicode lowercase expansion may shift offsets. Full-source adaptation would require an offset map or verifier.",
    });
  }
  return probes;
}

async function main() {
  await mkdir(scratch, { recursive: true });
  if (process.argv.includes("--setup")) {
    await writeFile(
      join(scratch, "package.json"),
      JSON.stringify(
        { name: "quillpane-search-comparison-only", private: true, type: "module" },
        null,
        2,
      ),
    );
    const setup = spawnSync("bun", ["add", "--exact", ...packages], {
      cwd: scratch,
      encoding: "utf8",
      windowsHide: true,
    });
    if (setup.status !== 0) throw new Error(setup.stderr);
    console.log(setup.stdout);
    return;
  }
  if (process.argv.includes("--correctness")) {
    await freezeSources();
    await loadFrozenEngine();
    const go = await compileGo();
    const ripgrep = toolAvailability(process.env.SEARCH_BENCH_RG ?? "rg", ["--version"]);
    const skipped = [!go.available ? "go" : "", !ripgrep.available ? "ripgrep" : ""].filter(
      Boolean,
    );
    console.log(
      JSON.stringify({ tools: { go, ripgrep }, probes: await correctnessProbes(skipped) }, null, 2),
    );
    return;
  }
  if (process.argv.includes("--oracle")) {
    const sources = await freezeSources();
    await loadFrozenEngine();
    console.log(JSON.stringify({ ...sources, ...(await oracleProbes()) }, null, 2));
    return;
  }
  const childIndex = process.argv.indexOf("--child");
  if (childIndex >= 0) {
    await loadFrozenEngine();
    const [engine, count, characters] = process.argv.slice(childIndex + 1);
    console.log(JSON.stringify(await childRun(engine, Number(count), Number(characters))));
    return;
  }
  if (!process.versions.v8 || !(globalThis as typeof globalThis & { gc?: () => void }).gc)
    throw new Error(
      "Build with Bun, then run using node --expose-gc for comparable post-GC memory measurements.",
    );
  const { source, reference } = await freezeSources();
  await loadFrozenEngine();
  const go = await compileGo();
  const ripgrep = toolAvailability(process.env.SEARCH_BENCH_RG ?? "rg", ["--version"]);
  const unavailable = [!go.available ? "go" : "", !ripgrep.available ? "ripgrep" : ""].filter(
    Boolean,
  );
  const harnessSHA256 = createHash("sha256")
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest("hex");
  const environment = {
    runtime: `${process.version} / V8 ${process.versions.v8}`,
    platform: process.platform,
    osRelease: release(),
    cpu: cpus()[0]?.model,
    logicalCPUs: cpus().length,
    tools: { go, ripgrep },
    dependencies: await Promise.all(
      ["@leeoniya/ufuzzy", "fuse.js", "minisearch", "flexsearch"].map(async (name) => {
        const metadata = JSON.parse(
          await readFile(join(scratch, "node_modules", name, "package.json"), "utf8"),
        );
        return { name, version: metadata.version };
      }),
    ),
  };
  const environmentSHA256 = createHash("sha256").update(JSON.stringify(environment)).digest("hex");
  const rows = [];
  const selectedEngines = process.argv
    .find((argument) => argument.startsWith("--engines="))
    ?.slice("--engines=".length)
    .split(",") ?? ["current", "ufuzzy", "minisearch", "go", "ripgrep"];
  const selectedFixtures = process.argv
    .find((argument) => argument.startsWith("--fixtures="))
    ?.slice("--fixtures=".length)
    .split(",");
  for (const fixture of fixtures.filter(
    (item) => !selectedFixtures || selectedFixtures.includes(item.name),
  )) {
    for (const engine of selectedEngines) {
      if (unavailable.includes(engine)) {
        process.stderr.write(
          `${fixture.name}/${engine} skipped: native tool unavailable (see tools metadata)\n`,
        );
        continue;
      }
      const rowPath = join(
        scratch,
        `row-${source.sha256.slice(0, 12)}-${reference.sha256.slice(0, 12)}-${harnessSHA256.slice(0, 12)}-${environmentSHA256.slice(0, 12)}-${fixture.name}-${engine}.json`,
      );
      if (process.argv.includes("--resume")) {
        try {
          rows.push(JSON.parse(await readFile(rowPath, "utf8")));
          process.stderr.write(`${fixture.name}/${engine} resumed\n`);
          continue;
        } catch {
          /* No completed row: run it below. */
        }
      }
      const output = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          fileURLToPath(import.meta.url),
          "--child",
          engine,
          String(fixture.notes),
          String(fixture.characters),
        ],
        { encoding: "utf8", windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
      );
      if (output.status !== 0) throw new Error(`${fixture.name}/${engine}: ${output.stderr}`);
      const row = {
        measuredAtUTC: new Date().toISOString(),
        fixture: fixture.name,
        ...JSON.parse(output.stdout),
      };
      rows.push(row);
      await writeFile(rowPath, JSON.stringify(row, null, 2));
      process.stderr.write(`${fixture.name}/${engine} completed\n`);
    }
  }
  const result = {
    timestampUTC: new Date().toISOString(),
    runtime: `${process.version} / V8 ${process.versions.v8}`,
    platform: process.platform,
    osRelease: release(),
    cpu: cpus()[0]?.model,
    sourceCommit: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
    harnessSHA256,
    environmentSHA256,
    environment,
    source,
    reference,
    tools: { go, ripgrep },
    nativeBinaryBytes: go.available
      ? (await stat(join(scratch, process.platform === "win32" ? "search-go.exe" : "search-go")))
          .size
      : undefined,
    methodology:
      "Fresh isolated Node/V8 process per engine+fixture; frozen helper SHA; deterministic varied identifiers plus CRLF/Unicode; same live buffer characters/result cap300; 2 warmups then9 samples(5 at≥8Mi chars). Heap/RSS snapshots after forced GC consistently. maxObservedHeapUsed samples after calls and is NOT peak; RSS isn't private committed. meanCpuMs is JS process only; meanNativeCpuMs is Windows native Go CPU delta/sample. Windows CPU accounting granularity affects all short samples; zero reported CPU is not zero work. Native engine time excludes JSON IPC. CLI rg CPU/peak memory not measured. Timer lateness is a separate1ms timer diagnostic, outside timed samples; Windows scheduler jitter included. Agent benchmarks serialized against builds/native profiling; unrelated desktop background activity not controlled. No DOM/native bridge/saving/read costs. Token-engine unequal result semantics explicitly flagged; do not compare a miss as a correct fast result.",
    dependencies: await dependencySizes(),
    correctness: await correctnessProbes(unavailable),
    rows,
  };
  await writeFile(join(scratch, "comparison.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

await main();
