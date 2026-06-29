#!/usr/bin/env node
import { createWriteStream } from 'node:fs'
import { constants } from 'node:fs'
import { access, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { finished } from 'node:stream/promises'

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  printUsage()
  process.exit(0)
}

const outputRoot = args.out ? path.resolve(String(args.out)) : null
if (!outputRoot) {
  printUsage()
  console.error('\nMissing required --out <path>')
  process.exit(2)
}

const options = {
  notes: parseNonNegativeInt(args.notes ?? args['note-count'], 5000, 'notes'),
  folders: parsePositiveInt(args.folders, 50, 'folders'),
  seed: parseNonNegativeInt(args.seed, 20260628, 'seed'),
  layout: parseLayout(args.layout ?? 'inbox'),
  noteBodyLines: parseNonNegativeInt(args['note-body-lines'], 5, 'note-body-lines'),
  largeMarkdownFiles: parseNonNegativeInt(
    args['large-markdown-files'] ?? args['large-md-files'],
    2,
    'large-markdown-files'
  ),
  largeMarkdownBytes: mibToBytes(
    parseNonNegativeFloat(args['large-markdown-mib'] ?? args['large-md-mib'], 16, 'large-markdown-mib')
  ),
  largeCodeFiles: parseNonNegativeInt(args['large-code-files'], 2, 'large-code-files'),
  largeCodeBytes: mibToBytes(parseNonNegativeFloat(args['large-code-mib'], 16, 'large-code-mib'))
}

await prepareOutputRoot(outputRoot, args)

const startedAt = Date.now()
const stats = {
  directories: 0,
  markdown_notes: 0,
  large_markdown_files: 0,
  large_code_files: 0,
  files: 0
}
const bytes = {
  markdown_notes: 0,
  large_markdown_files: 0,
  large_code_files: 0,
  manifest: 0,
  total: 0
}

await createVaultDirectories(outputRoot, options)

const noteFiles = buildNoteFiles(outputRoot, options)
await writeFilesInBatches(noteFiles)
for (const file of noteFiles) {
  stats.markdown_notes += 1
  stats.files += 1
  bytes.markdown_notes += file.bytes
}

for (let index = 0; index < options.largeMarkdownFiles; index += 1) {
  const file = path.join(outputRoot, noteBaseDir(options), 'Large Markdown', `large-markdown-${formatIndex(index, 3)}.md`)
  const written = await writeLargeMarkdown(file, options.largeMarkdownBytes, index, options)
  stats.large_markdown_files += 1
  stats.files += 1
  bytes.large_markdown_files += written
}

for (let index = 0; index < options.largeCodeFiles; index += 1) {
  const ext = codeExtension(index)
  const file = path.join(outputRoot, 'code', `large-code-${formatIndex(index, 3)}.${ext}`)
  const written = await writeLargeCode(file, options.largeCodeBytes, index, options)
  stats.large_code_files += 1
  stats.files += 1
  bytes.large_code_files += written
}

bytes.total = bytes.markdown_notes + bytes.large_markdown_files + bytes.large_code_files

const manifest = {
  schema_version: 1,
  generator: 'bench/generate-synthetic-vault.mjs',
  name: fixtureName(options),
  root: outputRoot,
  created_at_utc: new Date(startedAt).toISOString(),
  options,
  counts: stats,
  bytes,
  elapsed_ms: Date.now() - startedAt
}
stats.files += 1
let manifestBody = ''
for (let pass = 0; pass < 4; pass += 1) {
  manifest.bytes.total =
    manifest.bytes.markdown_notes +
    manifest.bytes.large_markdown_files +
    manifest.bytes.large_code_files +
    manifest.bytes.manifest
  manifestBody = JSON.stringify(manifest, null, 2) + '\n'
  const manifestBytes = Buffer.byteLength(manifestBody)
  if (manifest.bytes.manifest === manifestBytes) break
  manifest.bytes.manifest = manifestBytes
}
manifest.bytes.total =
  manifest.bytes.markdown_notes +
  manifest.bytes.large_markdown_files +
  manifest.bytes.large_code_files +
  manifest.bytes.manifest
manifestBody = JSON.stringify(manifest, null, 2) + '\n'
await writeFile(path.join(outputRoot, '.bench-vault-manifest.json'), manifestBody)

console.log(JSON.stringify(manifest, null, 2))

function printUsage() {
  console.log(`Usage:
node bench/generate-synthetic-vault.mjs \\
  --out /tmp/shreyamnotes-vault-5000-large \\
  --clean \\
  --notes 5000 \\
  --folders 50 \\
  --large-markdown-files 2 \\
  --large-markdown-mib 16 \\
  --large-code-files 2 \\
  --large-code-mib 16

Options:
  --out <path>                  Output vault root. Required.
  --clean                       Remove an existing generated vault before writing.
  --allow-clean-unmanaged       Allow --clean when no previous benchmark manifest exists.
  --notes <count>               Markdown notes to generate. Default: 5000.
  --folders <count>             Topic folders to spread notes across. Default: 50.
  --layout <inbox|root>         Put generated notes below inbox/ or vault root. Default: inbox.
  --seed <number>               Deterministic content seed. Default: 20260628.
  --note-body-lines <count>     Extra body lines per regular note. Default: 5.
  --large-markdown-files <n>    Very large markdown notes to generate. Default: 2.
  --large-markdown-mib <mib>    Size per large markdown file. Default: 16.
  --large-code-files <n>        Very large code files to generate. Default: 2.
  --large-code-mib <mib>        Size per large code file. Default: 16.`)
}

async function prepareOutputRoot(root, parsedArgs) {
  const exists = await pathExists(root)
  if (exists && parsedArgs.clean) {
    await cleanOutputRoot(root, parsedArgs)
  } else if (exists) {
    const info = await stat(root)
    if (!info.isDirectory()) throw new Error(`${root} already exists and is not a directory`)
    const entries = await readdir(root)
    if (entries.length > 0) {
      throw new Error(`${root} already exists and is not empty; pass --clean to regenerate it`)
    }
  }
  await mkdir(root, { recursive: true })
}

async function cleanOutputRoot(root, parsedArgs) {
  assertSafeCleanPath(root)
  const manifestPath = path.join(root, '.bench-vault-manifest.json')
  const info = await stat(root)
  const entries = info.isDirectory() ? await readdir(root) : ['<file>']
  if (!(await pathExists(manifestPath)) && entries.length > 0 && parsedArgs['allow-clean-unmanaged'] !== true) {
    throw new Error(
      `Refusing to clean ${root} because it has no .bench-vault-manifest.json; pass --allow-clean-unmanaged after verifying the path`
    )
  }
  await rm(root, { recursive: true, force: true })
}

function assertSafeCleanPath(root) {
  const resolved = path.resolve(root)
  const parsed = path.parse(resolved)
  const home = os.homedir()
  const cwd = process.cwd()
  if (resolved === parsed.root || resolved === home || resolved === cwd || resolved.length < parsed.root.length + 4) {
    throw new Error(`Refusing to clean unsafe output path: ${resolved}`)
  }
}

async function createVaultDirectories(root, config) {
  const dirs = new Set([
    '.zennotes',
    'archive',
    'code',
    'quick',
    'trash',
    path.join(noteBaseDir(config), 'Large Markdown')
  ])
  if (config.layout === 'inbox') dirs.add('inbox')
  for (let index = 0; index < config.folders; index += 1) {
    dirs.add(path.join(noteBaseDir(config), topicFolder(index)))
  }
  await Promise.all([...dirs].map((dir) => mkdir(path.join(root, dir), { recursive: true })))
  stats.directories = dirs.size
}

function buildNoteFiles(root, config) {
  const files = []
  for (let index = 0; index < config.notes; index += 1) {
    const topic = seededValue(config.seed, index, config.folders)
    const sprint = seededValue(config.seed, index + 97, 17)
    const id = formatIndex(index, 5)
    const title = `Synthetic Note ${id} Topic ${formatIndex(topic, 2)}`
    const relPath = path.join(noteBaseDir(config), topicFolder(topic), `${id}-topic-${formatIndex(topic, 2)}.md`)
    const body = noteBody({ index, id, topic, sprint, title, config })
    files.push({
      path: path.join(root, relPath),
      body,
      bytes: Buffer.byteLength(body)
    })
  }
  return files
}

function noteBody({ index, id, topic, sprint, title, config }) {
  const previous = index > 0 ? `[[${formatIndex(index - 1, 5)}-topic-${formatIndex(seededValue(config.seed, index - 1, config.folders), 2)}]]` : 'none'
  const next =
    index + 1 < config.notes
      ? `[[${formatIndex(index + 1, 5)}-topic-${formatIndex(seededValue(config.seed, index + 1, config.folders), 2)}]]`
      : 'none'
  const lines = [
    '---',
    `title: ${title}`,
    `tags: [perf, topic-${formatIndex(topic, 2)}, sprint-${formatIndex(sprint, 2)}]`,
    `synthetic_id: ${id}`,
    '---',
    '',
    `# ${title}`,
    '',
    `This deterministic benchmark note contains token desktop-runtime-benchmark-${id}.`,
    `It links to ${previous} and ${next} so backlink and wikilink paths have realistic work.`,
    '',
    '## Tasks',
    '',
    `- [${index % 7 === 0 ? 'x' : ' '}] Review generated item ${id}`,
    `- [ ] Follow up on topic-${formatIndex(topic, 2)} sprint-${formatIndex(sprint, 2)}`,
    '',
    '## Notes',
    ''
  ]

  for (let line = 0; line < config.noteBodyLines; line += 1) {
    lines.push(
      `Paragraph ${line} for note ${id}: topic-${formatIndex(topic, 2)} has searchable phrase needle-${formatIndex(
        seededValue(config.seed, index + line, 100000),
        5
      )} and stable markdown text for list, search, and preview simulations.`
    )
  }

  if (index % 11 === 0) {
    lines.push('', '```ts', `export const generated${id} = "topic-${formatIndex(topic, 2)}";`, '```')
  }

  lines.push('', `#perf #topic-${formatIndex(topic, 2)} #sprint-${formatIndex(sprint, 2)}`, '')
  return lines.join('\n')
}

async function writeLargeMarkdown(file, targetBytes, fileIndex, config) {
  await mkdir(path.dirname(file), { recursive: true })
  const header = [
    `# Large Markdown ${formatIndex(fileIndex, 3)}`,
    '',
    `Synthetic very large markdown file for fixture ${fixtureName(config)}.`,
    `Search token large-markdown-benchmark-${formatIndex(fileIndex, 3)}.`,
    ''
  ].join('\n')
  return writeSizedTextFile(file, targetBytes, header, (line) => {
    const targetNote = formatIndex(seededValue(config.seed + fileIndex, line, Math.max(1, config.notes)), 5)
    const section = formatIndex(line % 200, 3)
    if (line % 19 === 0) return `\n## Generated Section ${section}\n`
    if (line % 23 === 0) return `- [ ] Large markdown task ${line} references [[${targetNote}]] #large-md #section-${section}\n`
    if (line % 29 === 0) return `\`\`\`js\nconsole.log("large markdown ${fileIndex} line ${line}");\n\`\`\`\n`
    return `Large markdown line ${formatIndex(line, 7)} section-${section} repeats readable prose, [[${targetNote}]], #large-md, and benchmark token large-md-${formatIndex(fileIndex, 3)}-${formatIndex(line % 1000, 3)}.\n`
  })
}

async function writeLargeCode(file, targetBytes, fileIndex, config) {
  await mkdir(path.dirname(file), { recursive: true })
  const ext = path.extname(file).slice(1)
  const header = codeHeader(ext, fileIndex, config)
  return writeSizedTextFile(file, targetBytes, header, (line) => codeLine(ext, line, fileIndex, config))
}

async function writeSizedTextFile(file, targetBytes, header, makeLine) {
  const stream = createWriteStream(file, { encoding: 'utf8' })
  let written = 0
  try {
    written += await writeChunk(stream, trimToRemaining(header.endsWith('\n') ? header : `${header}\n`, targetBytes, written))
    let line = 0
    while (written < targetBytes) {
      const chunk = makeLine(line)
      written += await writeChunk(stream, trimToRemaining(chunk, targetBytes, written))
      line += 1
    }
    stream.end()
    await finished(stream)
    return written
  } catch (err) {
    stream.destroy()
    throw err
  }
}

function trimToRemaining(chunk, targetBytes, written) {
  const remaining = targetBytes - written
  if (remaining <= 0) return ''
  if (chunk.length <= remaining) return chunk
  return chunk.slice(0, remaining)
}

async function writeChunk(stream, chunk) {
  if (!chunk) return 0
  if (!stream.write(chunk)) await once(stream, 'drain')
  return Buffer.byteLength(chunk)
}

async function writeFilesInBatches(files, batchSize = 128) {
  for (let index = 0; index < files.length; index += batchSize) {
    await Promise.all(files.slice(index, index + batchSize).map((file) => writeFile(file.path, file.body)))
  }
}

function codeHeader(ext, fileIndex, config) {
  const token = `large-code-benchmark-${formatIndex(fileIndex, 3)}`
  if (ext === 'go') return `package synthetic\n\n// ${token} generated for ${fixtureName(config)}.\n\n`
  if (ext === 'py') return `"""${token} generated for ${fixtureName(config)}."""\n\n`
  if (ext === 'css') return `/* ${token} generated for ${fixtureName(config)}. */\n\n`
  return `// ${token} generated for ${fixtureName(config)}.\n\n`
}

function codeLine(ext, line, fileIndex, config) {
  const id = formatIndex(line, 7)
  const topic = formatIndex(seededValue(config.seed + fileIndex, line, Math.max(1, config.folders)), 2)
  if (ext === 'go') {
    return `func Generated${formatIndex(fileIndex, 3)}_${id}(input string) string { return input + "-topic-${topic}-${id}" }\n`
  }
  if (ext === 'py') {
    return `def generated_${formatIndex(fileIndex, 3)}_${id}(value):\n    return f"{value}-topic-${topic}-${id}"\n\n`
  }
  if (ext === 'css') {
    return `.generated-${formatIndex(fileIndex, 3)}-${id} { content: "topic-${topic}-${id}"; margin-left: ${line % 48}px; }\n`
  }
  return `export function generated${formatIndex(fileIndex, 3)}_${id}(input: string): string { return input + "-topic-${topic}-${id}" }\n`
}

function codeExtension(index) {
  return ['ts', 'go', 'py', 'css'][index % 4]
}

function noteBaseDir(config) {
  return config.layout === 'inbox' ? 'inbox' : '.'
}

function topicFolder(index) {
  return `Topic ${formatIndex(index, 2)}`
}

function fixtureName(config) {
  return [
    `notes${config.notes}`,
    `folders${config.folders}`,
    `md${config.largeMarkdownFiles}x${bytesToMibLabel(config.largeMarkdownBytes)}`,
    `code${config.largeCodeFiles}x${bytesToMibLabel(config.largeCodeBytes)}`,
    `seed${config.seed}`
  ].join('-')
}

function seededValue(seed, index, modulo) {
  if (modulo <= 0) return 0
  let value = (seed >>> 0) + Math.imul(index + 1, 2654435761)
  value ^= value >>> 16
  value = Math.imul(value, 2246822519)
  value ^= value >>> 13
  return Math.abs(value >>> 0) % modulo
}

function formatIndex(index, width) {
  return String(index).padStart(width, '0')
}

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--') {
      out._.push(...argv.slice(i + 1))
      break
    }
    if (!token.startsWith('--')) {
      out._.push(token)
      continue
    }
    const eq = token.indexOf('=')
    if (eq > 2) {
      out[token.slice(2, eq)] = token.slice(eq + 1)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      out[key] = next
      i += 1
    } else {
      out[key] = true
    }
  }
  return out
}

function parseLayout(raw) {
  if (raw === 'inbox' || raw === 'root') return raw
  throw new Error(`layout must be "inbox" or "root", got ${raw}`)
}

function parsePositiveInt(raw, fallback, label) {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (raw === undefined || raw === null || raw === '') return fallback
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  throw new Error(`${label} must be a positive integer`)
}

function parseNonNegativeInt(raw, fallback, label) {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (raw === undefined || raw === null || raw === '') return fallback
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  throw new Error(`${label} must be a non-negative integer`)
}

function parseNonNegativeFloat(raw, fallback, label) {
  const parsed = Number.parseFloat(raw ?? '')
  if (raw === undefined || raw === null || raw === '') return fallback
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  throw new Error(`${label} must be a non-negative number`)
}

function mibToBytes(value) {
  return Math.round(value * 1024 * 1024)
}

function bytesToMibLabel(value) {
  const mib = value / 1024 / 1024
  if (Number.isInteger(mib)) return `${mib}MiB`
  return `${mib < 1 ? mib.toFixed(2) : mib.toFixed(1)}MiB`
}

async function pathExists(file) {
  try {
    await access(file, constants.F_OK)
    return true
  } catch {
    return false
  }
}
