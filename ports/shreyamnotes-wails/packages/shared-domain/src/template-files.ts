// Parsing/serialization for custom template `.md` files. Lives in shared-domain
// so both the renderer (palette, preview, save-as-template) and any Node-side
// caller share one frontmatter implementation. The main process only does file
// I/O and never parses, so this is the single source of truth for the format.
import type { NoteFolder } from '@zennotes/bridge-contract/ipc'
import type { NoteTemplate, TemplateCategory } from '@zennotes/bridge-contract/templates'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export interface ParsedFrontmatter {
  data: Record<string, string>
  body: string
}

/**
 * Split a leading YAML frontmatter block (flat `key: value` scalars only) from
 * the body. Tolerant: no fence, or a malformed one, yields the whole input as
 * the body with empty data. Never throws.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) return { data: {}, body: raw }
  const data: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    data[key] = value
  }
  return { data, body: raw.slice(match[0].length) }
}

function normalizeCategory(value: string | undefined): TemplateCategory {
  if (value === 'Engineering' || value === 'Personal' || value === 'Custom') return value
  return 'Custom'
}

function normalizeTargetFolder(value: string | undefined): NoteFolder | undefined {
  // 'trash' and anything unknown fall back to undefined (the caller defaults to
  // 'inbox'); never let a template create directly in trash.
  if (value === 'inbox' || value === 'quick' || value === 'archive') return value
  return undefined
}

function filenameStem(sourcePath: string): string {
  const file = sourcePath.split('/').pop() ?? sourcePath
  return file.replace(/\.md$/i, '')
}

/** Turn a display name into a safe, lowercase filename stem. */
export function slugifyTemplateName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'template'
}

/** Parse a raw custom-template file into a NoteTemplate. Never throws. */
export function parseCustomTemplate(raw: string, sourcePath: string): NoteTemplate {
  const { data, body } = parseFrontmatter(raw)
  const stem = filenameStem(sourcePath)
  const name = data.name?.trim() || stem
  return {
    id: `custom:${stem}`,
    name,
    description: data.description?.trim() ?? '',
    category: normalizeCategory(data.category),
    body,
    titleTemplate: data.titleTemplate?.trim() || undefined,
    targetFolder: normalizeTargetFolder(data.targetFolder),
    targetSubpath: data.targetSubpath?.trim() || undefined,
    builtin: false,
    sourcePath,
    builtinId: data.builtinId?.trim() || undefined
  }
}

const CATEGORY_ORDER: TemplateCategory[] = ['Engineering', 'Personal', 'Custom']

/**
 * Combine built-in and custom templates into one display list, grouped by
 * category (Engineering → Personal → Custom), built-ins before custom within a
 * group, then alphabetical by name.
 */
export function mergeTemplates(
  builtins: NoteTemplate[],
  custom: NoteTemplate[]
): NoteTemplate[] {
  const rank = (c: TemplateCategory): number => {
    const i = CATEGORY_ORDER.indexOf(c)
    return i === -1 ? CATEGORY_ORDER.length : i
  }
  // A custom template carrying `builtinId` is an edited copy of that built-in;
  // it replaces the built-in in the list rather than appearing alongside it.
  const overridden = new Set(custom.map((c) => c.builtinId).filter(Boolean) as string[])
  const effectiveBuiltins = builtins.filter((b) => !overridden.has(b.id))
  // A customized built-in (override) keeps a built-in's standing so it stays in
  // its natural alphabetical spot rather than dropping into the custom group.
  const isPrimary = (t: NoteTemplate): boolean => t.builtin || !!t.builtinId
  return [...effectiveBuiltins, ...custom].sort((a, b) => {
    if (a.category !== b.category) return rank(a.category) - rank(b.category)
    if (isPrimary(a) !== isPrimary(b)) return isPrimary(a) ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export interface ComposeTemplateInput {
  name: string
  description?: string
  category?: TemplateCategory
  titleTemplate?: string
  targetFolder?: NoteFolder
  targetSubpath?: string
  /** Set when this file is an edited copy of a built-in template. */
  builtinId?: string
  body: string
}

function yamlScalar(value: string): string {
  // Quote when the value could be misread as YAML structure or has edge
  // whitespace; JSON.stringify yields a valid double-quoted, escaped scalar.
  if (/[:#"'\n]/.test(value) || value.trim() !== value || value === '') {
    return JSON.stringify(value)
  }
  return value
}

/** Build a raw template `.md` (frontmatter + body) from structured fields. */
export function composeTemplateFile(input: ComposeTemplateInput): string {
  const lines = ['---', `name: ${yamlScalar(input.name)}`]
  if (input.description) lines.push(`description: ${yamlScalar(input.description)}`)
  lines.push(`category: ${input.category ?? 'Custom'}`)
  if (input.titleTemplate) lines.push(`titleTemplate: ${yamlScalar(input.titleTemplate)}`)
  if (input.targetFolder) lines.push(`targetFolder: ${input.targetFolder}`)
  if (input.targetSubpath) lines.push(`targetSubpath: ${yamlScalar(input.targetSubpath)}`)
  if (input.builtinId) lines.push(`builtinId: ${input.builtinId}`)
  lines.push('---')
  // One newline after the closing fence so the parser (which consumes a single
  // trailing newline) round-trips the body without a stray leading blank line.
  return `${lines.join('\n')}\n${input.body.replace(/^\n+/, '')}`
}
