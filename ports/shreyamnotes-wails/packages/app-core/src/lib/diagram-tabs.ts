const DIAGRAM_TAB_PREFIX = 'zen://diagram/'

export type DiagramTabKind = 'mermaid' | 'tikz' | 'jsxgraph' | 'function-plot'

export interface DiagramTabPayload {
  id: string
  kind: DiagramTabKind
  source: string
}

const diagramTabs = new Map<string, DiagramTabPayload>()
let diagramTabSequence = 0

const DIAGRAM_KIND_LABELS: Record<DiagramTabKind, string> = {
  mermaid: 'Mermaid diagram',
  tikz: 'TikZ diagram',
  jsxgraph: 'JSXGraph diagram',
  'function-plot': 'Function plot'
}

function nextDiagramTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  diagramTabSequence += 1
  return `${Date.now().toString(36)}-${diagramTabSequence.toString(36)}`
}

export function diagramTabPath(kind: DiagramTabKind, source: string): string {
  const id = nextDiagramTabId()
  diagramTabs.set(id, { id, kind, source })
  return `${DIAGRAM_TAB_PREFIX}${encodeURIComponent(id)}`
}

export function isDiagramTabPath(path: string | null | undefined): boolean {
  return typeof path === 'string' && path.startsWith(DIAGRAM_TAB_PREFIX)
}

export function diagramFromTabPath(path: string | null | undefined): DiagramTabPayload | null {
  if (!path || !isDiagramTabPath(path)) return null
  const encoded = path.slice(DIAGRAM_TAB_PREFIX.length)
  if (!encoded) return null
  try {
    return diagramTabs.get(decodeURIComponent(encoded)) ?? null
  } catch {
    return diagramTabs.get(encoded) ?? null
  }
}

export function diagramTitleFromTabPath(path: string | null | undefined): string {
  const diagram = diagramFromTabPath(path)
  if (!diagram) return 'Diagram'
  return diagramTitleFromKind(diagram.kind)
}

export function diagramTitleFromKind(kind: DiagramTabKind): string {
  return DIAGRAM_KIND_LABELS[kind]
}
