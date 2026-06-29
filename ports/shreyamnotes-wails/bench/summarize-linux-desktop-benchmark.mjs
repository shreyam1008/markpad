#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  console.log(`Usage:
node bench/summarize-linux-desktop-benchmark.mjs [bench/results/linux-benchmark.jsonl]

Options:
  --input <file>       JSONL file to summarize
  --suite <id>         Only include records with scenario.suite_id
  --app <name>         Only include records with app.name
  --runtime <name>     Only include records with app.runtime
  --scenario <name>    Only include records with scenario.name
  --json               Emit structured JSON instead of a Markdown table`)
  process.exit(0)
}

const inputPath = args.input ?? args.in ?? args._[0] ?? 'bench/results/linux-benchmark.jsonl'
const records = filterRecords(await readJsonl(inputPath), args)

if (records.length === 0) {
  console.error(`No benchmark records matched ${inputPath}`)
  process.exit(1)
}

const summaries = [...groupRecords(records).values()]
  .map(summarizeGroup)
  .sort((a, b) =>
    [a.suite_id, a.app, a.runtime, a.scenario, a.fixture].join('\0').localeCompare(
      [b.suite_id, b.app, b.runtime, b.scenario, b.fixture].join('\0')
    )
  )

if (args.json) {
  console.log(
    JSON.stringify(
      {
        input: inputPath,
        records: records.length,
        groups: summaries
      },
      null,
      2
    )
  )
} else {
  printMarkdownTable(inputPath, summaries)
}

async function readJsonl(file) {
  const text = await readFile(file, 'utf8')
  const records = []
  for (const [idx, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    try {
      records.push(JSON.parse(line))
    } catch (err) {
      throw new Error(`Invalid JSON on ${file}:${idx + 1}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return records
}

function filterRecords(records, filters) {
  return records.filter((record) => {
    if (filters.suite && (record.scenario?.suite_id ?? 'legacy') !== filters.suite) return false
    if (filters.app && record.app?.name !== filters.app) return false
    if (filters.runtime && record.app?.runtime !== filters.runtime) return false
    if (filters.scenario && record.scenario?.name !== filters.scenario) return false
    return true
  })
}

function groupRecords(records) {
  const groups = new Map()
  for (const record of records) {
    const key = [
      record.scenario?.suite_id ?? 'legacy',
      record.app?.name ?? 'unknown',
      record.app?.runtime ?? 'unknown',
      record.scenario?.name ?? 'unknown',
      fixtureLabel(record)
    ].join('\0')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }
  return groups
}

function summarizeGroup(records) {
  const okRecords = records.filter((record) => record.startup?.success === true)
  const memoryRecords = okRecords.filter((record) => (record.memory?.samples?.length ?? 0) > 0)
  const names = new Set()
  const errors = new Map()

  for (const record of records) {
    for (const name of record.processes?.names ?? []) names.add(name)
    for (const error of record.errors ?? []) errors.set(error, (errors.get(error) ?? 0) + 1)
  }

  return {
    suite_id: records[0]?.scenario?.suite_id ?? 'legacy',
    app: records[0]?.app?.name ?? 'unknown',
    runtime: records[0]?.app?.runtime ?? 'unknown',
    scenario: records[0]?.scenario?.name ?? 'unknown',
    fixture: fixtureLabel(records[0]),
    total_runs: records.length,
    successful_runs: okRecords.length,
    failed_runs: records.length - okRecords.length,
    startup_wall_ms: stats(values(okRecords, (record) => record.startup?.startup_wall_ms)),
    process_count_at_ready: stats(values(memoryRecords, (record) => record.processes?.count_at_ready)),
    process_count_max: stats(values(memoryRecords, (record) => record.processes?.max_count)),
    rss_max_kib: stats(values(memoryRecords, (record) => record.memory?.summary?.rss_max_kib)),
    pss_max_kib: stats(values(memoryRecords, (record) => record.memory?.summary?.pss_max_kib)),
    uss_max_kib: stats(values(memoryRecords, (record) => record.memory?.summary?.uss_max_kib)),
    process_names: [...names].sort(),
    errors: [...errors].map(([message, count]) => ({ message, count }))
  }
}

function values(records, selector) {
  return records.map(selector).map(Number).filter(Number.isFinite)
}

function stats(rawValues) {
  if (rawValues.length === 0) {
    return { count: 0, min: null, median: null, p95: null, max: null }
  }

  const sorted = [...rawValues].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]

  return {
    count: sorted.length,
    min: sorted[0],
    median,
    p95,
    max: sorted[sorted.length - 1]
  }
}

function printMarkdownTable(inputPath, summaries) {
  console.log(`Input: ${inputPath}`)
  console.log('')
  const header = [
    'Suite',
    'App',
    'Runtime',
    'Scenario',
    'Fixture',
    'OK/Total',
    'Startup ms med/p95',
    'Proc ready med/p95',
    'Proc max med/p95',
    'RSS max MiB med/p95',
    'PSS max MiB med/p95',
    'USS max MiB med/p95',
    'Names'
  ]
  const rows = summaries.map((summary) => [
    summary.suite_id,
    summary.app,
    summary.runtime,
    summary.scenario,
    summary.fixture,
    `${summary.successful_runs}/${summary.total_runs}`,
    formatPair(summary.startup_wall_ms),
    formatPair(summary.process_count_at_ready),
    formatPair(summary.process_count_max),
    formatKibPair(summary.rss_max_kib),
    formatKibPair(summary.pss_max_kib),
    formatKibPair(summary.uss_max_kib),
    summary.process_names.join(', ') || 'n/a'
  ])

  printTable(header, rows)

  const failed = summaries.filter((summary) => summary.failed_runs > 0 || summary.errors.length > 0)
  if (failed.length === 0) return

  console.log('')
  console.log('Failures:')
  for (const summary of failed) {
    const label = `${summary.suite_id} ${summary.app} ${summary.scenario}`
    const errors = summary.errors.map((error) => `${error.count}x ${error.message}`).join('; ') || 'unknown error'
    console.log(`- ${label}: ${summary.failed_runs} failed run(s); ${errors}`)
  }
}

function printTable(header, rows) {
  const escapedRows = [header, ...rows].map((row) => row.map(escapeCell))
  const widths = header.map((_, col) => Math.max(...escapedRows.map((row) => row[col].length)))
  const formatRow = (row) => `| ${row.map((cell, col) => cell.padEnd(widths[col])).join(' | ')} |`

  console.log(formatRow(escapedRows[0]))
  console.log(`| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`)
  for (const row of escapedRows.slice(1)) console.log(formatRow(row))
}

function formatPair(metric) {
  return metric.count === 0 ? 'n/a' : `${formatNumber(metric.median)}/${formatNumber(metric.p95)}`
}

function formatKibPair(metric) {
  return metric.count === 0 ? 'n/a' : `${formatMib(metric.median)}/${formatMib(metric.p95)}`
}

function formatMib(kib) {
  return (kib / 1024).toFixed(1)
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|')
}

function fixtureLabel(record) {
  const fixture = record.scenario?.vault_fixture
  if (!fixture) return 'n/a'

  const counts = fixture.counts ?? {}
  const parts = []
  if (Number.isFinite(Number(counts.markdown_notes))) parts.push(`${counts.markdown_notes} notes`)
  if (Number.isFinite(Number(counts.large_markdown_files))) parts.push(`${counts.large_markdown_files} large md`)
  if (Number.isFinite(Number(counts.large_code_files))) parts.push(`${counts.large_code_files} large code`)

  const name = fixture.name ?? 'vault'
  return parts.length ? `${name} (${parts.join(', ')})` : name
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
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}
