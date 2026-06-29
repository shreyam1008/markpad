#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'

const args = parseArgs(process.argv.slice(2))

if (!args.cmd || !args.app) {
  console.error(`Usage:
node bench/linux-desktop-benchmark.mjs \\
  --app shreyamnotes-wails \\
  --runtime wails-webkitgtk \\
  --cmd ./dist/shreyamnotes \\
  --vault /tmp/shreyamnotes-vault-5000-large \\
  --runs 10 \\
  --sample-seconds 10 \\
  --suite linux-2026-06-28 \\
  --ready-regex 'ShreyamNotes DOM probe.*"rootFound":true' \\
  --env SHREYAMNOTES_DEBUG_BOOT=1 \\
  --out bench/results/linux-benchmark.jsonl`)
  process.exit(2)
}

const extraEnv = parseEnv(args.env)
const explicitVaultRoot = args.vault ? path.resolve(String(args.vault)) : null
const configuredVaultRoot = explicitVaultRoot ?? vaultRootFromEnv(extraEnv)
if (configuredVaultRoot) await assertDirectory(configuredVaultRoot, 'vault')
const vaultFixture = configuredVaultRoot ? await readVaultFixture(configuredVaultRoot, args['vault-manifest']) : null

const runs = Number(args.runs ?? 10)
const sampleSeconds = Number(args['sample-seconds'] ?? 10)
const readyRegex = new RegExp(args['ready-regex'] ?? '.')
const outPath = args.out ?? 'bench/results/linux-benchmark.jsonl'
const outDir = path.dirname(outPath)
const suiteId = args.suite ?? new Date().toISOString().replace(/[:.]/g, '-')
await mkdir(outDir, { recursive: true })

const stream = createWriteStream(outPath, { flags: 'a' })
for (let i = 1; i <= runs; i++) {
  const result = await runOnce(i)
  stream.write(JSON.stringify(result) + '\n')
  console.log(
    `${result.app.name} run ${i}/${runs}: startup=${result.startup.startup_wall_ms}ms rss_max=${result.memory.summary.rss_max_kib}KiB pss_max=${result.memory.summary.pss_max_kib}KiB`
  )
}
stream.end()

async function runOnce(runIndex) {
  const profile = await mkdtemp(path.join(os.tmpdir(), `${args.app}-${runIndex}-`))
  const env = {
    ...process.env,
    HOME: path.join(profile, 'home'),
    XDG_CONFIG_HOME: path.join(profile, 'config'),
    XDG_CACHE_HOME: path.join(profile, 'cache'),
    XDG_DATA_HOME: path.join(profile, 'data'),
    ...extraEnv
  }
  if (explicitVaultRoot) {
    env.ZENNOTES_VAULT_PATH = explicitVaultRoot
    if (!env.ZENNOTES_BROWSE_ROOTS) env.ZENNOTES_BROWSE_ROOTS = explicitVaultRoot
  }
  await Promise.all([
    mkdir(env.HOME, { recursive: true }),
    mkdir(env.XDG_CONFIG_HOME, { recursive: true }),
    mkdir(env.XDG_CACHE_HOME, { recursive: true }),
    mkdir(env.XDG_DATA_HOME, { recursive: true })
  ])

  const started = process.hrtime.bigint()
  let readyNs = null
  let readyDetail = ''
  let output = ''
  const launchArgs = [...args._]
  let cdpPort = null
  if (args['ready-mode'] === 'cdp-dom') {
    cdpPort = await getFreePort()
    launchArgs.push(`--remote-debugging-port=${cdpPort}`)
  }

  const child = spawn(args.cmd, launchArgs, {
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const rootProcPromise = waitForProcStat(child.pid, 1000)

  const onData = (chunk) => {
    const text = chunk.toString()
    output += text
    if (args['ready-mode'] === 'cdp-dom') {
      return
    }
    const match = output.match(readyRegex)
    if (match && readyNs === null) {
      readyNs = process.hrtime.bigint()
      readyDetail = match[0].slice(0, 500)
    }
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)

  const timeoutMs = Number(args['ready-timeout-ms'] ?? 30000)
  let exitBeforeReady = false
  child.once('exit', () => {
    if (readyNs === null) exitBeforeReady = true
  })

  if (args['ready-mode'] === 'cdp-dom') {
    try {
      const detail = await waitForCdpExpression(
        cdpPort,
        args['ready-js'] ?? 'document.body && document.body.textContent.trim().length > 0',
        timeoutMs,
        () => exitBeforeReady
      )
      readyNs = process.hrtime.bigint()
      readyDetail = detail
    } catch (err) {
      output += `\n[benchmark] CDP readiness failed: ${err instanceof Error ? err.message : String(err)}\n`
    }
  } else {
    const deadline = Date.now() + timeoutMs
    while (readyNs === null && Date.now() < deadline && !exitBeforeReady) {
      await sleep(50)
    }
  }

  const samples = []
  const rootProc = await rootProcPromise
  if (readyNs !== null) {
    for (let s = 0; s < sampleSeconds; s++) {
      samples.push(await sampleTree(child.pid, Number(process.hrtime.bigint() - readyNs) / 1e6, rootProc))
      await sleep(1000)
    }
  }

  await terminateProcessSet(child.pid, rootProc)

  await rm(profile, { recursive: true, force: true })

  return {
    schema_version: 1,
    timestamp_utc: new Date().toISOString(),
    host: await hostInfo(),
    app: {
      name: args.app,
      runtime: args.runtime ?? 'unknown',
      executable: args.cmd,
      executable_bytes: await fileSize(args.cmd)
    },
    scenario: {
      name: args.scenario ?? 'profile_cold',
      suite_id: suiteId,
      run_index: runIndex,
      runs,
      sample_seconds: sampleSeconds,
      fresh_home: true,
      vault_fixture: vaultFixture
    },
    startup: {
      success: readyNs !== null,
      startup_wall_ms: readyNs === null ? null : Math.round(Number(readyNs - started) / 1e6),
      ready_mode: args['ready-mode'] === 'cdp-dom' ? 'cdp-dom' : 'log-regex',
      ready_detail: readyDetail,
      exit_before_ready: exitBeforeReady
    },
    processes: summarizeProcesses(samples),
    memory: {
      samples,
      summary: summarizeMemory(samples)
    },
    errors:
      readyNs === null
        ? [`${args['ready-mode'] === 'cdp-dom' ? 'CDP readiness' : 'ready regex'} not observed within ${timeoutMs}ms`]
        : []
  }
}

async function sampleTree(rootPid, tMs, rootProc) {
  const pids = await processSet(rootPid, rootProc)
  const rolls = await Promise.all(pids.map(readSmapsRollup))
  const present = rolls.filter(Boolean)
  return {
    t_ms: Math.round(tMs),
    process_count: present.length,
    pids: present.map((p) => p.pid).sort((a, b) => a - b),
    names: present.map((p) => p.name).filter(Boolean),
    rss_kib: sum(present, 'rss_kib'),
    pss_kib: sum(present, 'pss_kib'),
    uss_kib: sum(present, 'uss_kib')
  }
}

async function processSet(rootPid, rootProc) {
  const pids = new Set(await processTree(rootPid))
  if (rootProc) {
    for (const pid of await processGroup(rootProc)) pids.add(pid)
  }
  return [...pids].sort((a, b) => Number(a) - Number(b))
}

async function processTree(rootPid) {
  const seen = new Set()
  const queue = [String(rootPid)]
  while (queue.length) {
    const pid = queue.shift()
    if (!pid || seen.has(pid)) continue
    seen.add(pid)
    queue.push(...(await childPids(pid)))
  }
  return [...seen]
}

async function childPids(pid) {
  try {
    const tids = await readdir(`/proc/${pid}/task`)
    const childLists = await Promise.all(
      tids.map((tid) => readFile(`/proc/${pid}/task/${tid}/children`, 'utf8').catch(() => ''))
    )
    return childLists.flatMap((children) => children.trim().split(/\s+/).filter(Boolean))
  } catch {
    return []
  }
}

async function processGroup(rootProc) {
  const entries = await readdir('/proc', { withFileTypes: true })
  const stats = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => readProcStat(entry.name))
  )
  return stats
    .filter((proc) => proc && (proc.pgrp === rootProc.pgrp || proc.session === rootProc.session))
    .map((proc) => String(proc.pid))
}

async function waitForProcStat(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const proc = await readProcStat(pid)
    if (proc) return proc
    await sleep(25)
  }
  return null
}

async function readProcStat(pid) {
  try {
    const raw = await readFile(`/proc/${pid}/stat`, 'utf8')
    const open = raw.indexOf('(')
    const close = raw.lastIndexOf(')')
    if (open < 0 || close < open) return null
    const fields = raw.slice(close + 2).trim().split(/\s+/)
    return {
      pid: Number(raw.slice(0, open).trim()),
      comm: raw.slice(open + 1, close),
      state: fields[0] ?? '',
      ppid: Number(fields[1] ?? 0),
      pgrp: Number(fields[2] ?? 0),
      session: Number(fields[3] ?? 0)
    }
  } catch {
    return null
  }
}

async function terminateProcessSet(rootPid, rootProc) {
  let pids = []
  try {
    pids = await processSet(rootPid, rootProc)
  } catch {}

  try {
    process.kill(-rootPid, 'SIGTERM')
  } catch {}
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM')
    } catch {}
  }

  await sleep(500)

  try {
    pids = await processSet(rootPid, rootProc)
  } catch {}
  for (const pid of pids.reverse()) {
    try {
      process.kill(Number(pid), 'SIGKILL')
    } catch {}
  }
  try {
    process.kill(-rootPid, 'SIGKILL')
  } catch {}
}

async function readSmapsRollup(pid) {
  try {
    const [smaps, comm] = await Promise.all([
      readFile(`/proc/${pid}/smaps_rollup`, 'utf8'),
      readFile(`/proc/${pid}/comm`, 'utf8').catch(() => '')
    ])
    const get = (label) => {
      const match = smaps.match(new RegExp(`^${label}:\\s+(\\d+)\\s+kB`, 'm'))
      return match ? Number(match[1]) : 0
    }
    return {
      pid: Number(pid),
      name: comm.trim(),
      rss_kib: get('Rss'),
      pss_kib: get('Pss'),
      uss_kib: get('Private_Clean') + get('Private_Dirty') + get('Private_Hugetlb')
    }
  } catch {
    return null
  }
}

function summarizeMemory(samples) {
  return {
    rss_avg_kib: avg(samples, 'rss_kib'),
    rss_max_kib: max(samples, 'rss_kib'),
    pss_avg_kib: avg(samples, 'pss_kib'),
    pss_max_kib: max(samples, 'pss_kib'),
    uss_avg_kib: avg(samples, 'uss_kib'),
    uss_max_kib: max(samples, 'uss_kib')
  }
}

function summarizeProcesses(samples) {
  const names = new Set()
  for (const sample of samples) for (const name of sample.names ?? []) names.add(name)
  return {
    count_at_ready: samples[0]?.process_count ?? 0,
    max_count: max(samples, 'process_count'),
    names: [...names].sort()
  }
}

async function hostInfo() {
  return {
    os: 'linux',
    kernel: os.release(),
    arch: os.arch(),
    cpu_model: os.cpus()[0]?.model ?? '',
    memory_total_kib: Math.round(os.totalmem() / 1024),
    display: process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : 'headless'
  }
}

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--') {
      out._.push(...argv.slice(i + 1))
      break
    }
    if (!token.startsWith('--')) {
      out._.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      if (out[key] === undefined) out[key] = next
      else out[key] = Array.isArray(out[key]) ? [...out[key], next] : [out[key], next]
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('could not allocate TCP port'))
      })
    })
    server.on('error', reject)
  })
}

async function waitForCdpExpression(port, expression, timeoutMs, shouldStop) {
  const deadline = Date.now() + timeoutMs
  let ws = null
  try {
    while (Date.now() < deadline) {
      if (shouldStop()) throw new Error('process exited before CDP readiness')
      if (!ws) {
        const target = await firstPageTarget(port).catch(() => null)
        if (target?.webSocketDebuggerUrl) {
          ws = await openCdp(target.webSocketDebuggerUrl).catch(() => null)
          if (ws) await cdpRequest(ws, 'Runtime.enable')
        }
      }
      if (ws) {
        try {
          const result = await cdpRequest(ws, 'Runtime.evaluate', {
            expression: `Boolean(${expression})`,
            returnByValue: true
          })
          if (result?.result?.value === true) {
            return `cdp-dom true on :${port}`
          }
        } catch {
          try {
            ws.close()
          } catch {}
          ws = null
        }
      }
      await sleep(50)
    }
    throw new Error(`timed out waiting for CDP expression on :${port}`)
  } finally {
    try {
      ws?.close()
    } catch {}
  }
}

async function firstPageTarget(port) {
  const targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`)
  return targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) ?? null
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(500, () => req.destroy(new Error(`timeout requesting ${url}`)))
  })
}

function openCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

let cdpId = 1
function cdpRequest(ws, method, params = {}) {
  const id = cdpId++
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const msg = JSON.parse(String(raw))
      if (msg.id !== id) return
      ws.off('message', onMessage)
      if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
    ws.on('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

function vaultRootFromEnv(env) {
  const raw = env.ZENNOTES_VAULT_PATH ?? process.env.ZENNOTES_VAULT_PATH
  return raw ? path.resolve(raw) : null
}

async function assertDirectory(dir, label) {
  try {
    const info = await stat(dir)
    if (!info.isDirectory()) throw new Error(`${label} path is not a directory: ${dir}`)
  } catch (err) {
    if (err instanceof Error && err.message.includes('not a directory')) throw err
    throw new Error(`${label} path does not exist: ${dir}`)
  }
}

async function readVaultFixture(vaultRoot, manifestArg) {
  const explicitManifest = manifestArg !== undefined && manifestArg !== true
  const manifestPath = explicitManifest
    ? path.resolve(String(manifestArg))
    : path.join(vaultRoot, '.bench-vault-manifest.json')
  let manifest = null
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (err) {
    if (explicitManifest) {
      throw new Error(
        `Could not read vault manifest ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return {
    root: vaultRoot,
    manifest_path: manifest ? manifestPath : null,
    name: manifest?.name ?? path.basename(vaultRoot),
    schema_version: manifest?.schema_version ?? null,
    generator: manifest?.generator ?? null,
    counts: manifest?.counts ?? null,
    bytes: manifest?.bytes ?? null,
    options: manifest?.options ?? null
  }
}

function parseEnv(values) {
  const env = {}
  for (const entry of [values].flat().filter(Boolean)) {
    const idx = entry.indexOf('=')
    if (idx > 0) env[entry.slice(0, idx)] = entry.slice(idx + 1)
  }
  return env
}

async function fileSize(file) {
  try {
    return (await stat(file)).size
  } catch {
    return 0
  }
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
}

function max(rows, key) {
  return rows.length ? Math.max(...rows.map((row) => Number(row[key] ?? 0))) : 0
}

function avg(rows, key) {
  return rows.length ? Math.round(sum(rows, key) / rows.length) : 0
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
