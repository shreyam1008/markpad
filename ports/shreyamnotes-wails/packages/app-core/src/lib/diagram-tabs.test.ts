import { describe, expect, it } from 'vitest'
import {
  diagramFromTabPath,
  diagramTabPath,
  diagramTitleFromTabPath,
  isDiagramTabPath
} from './diagram-tabs'

describe('diagram-tabs', () => {
  it('creates a virtual tab path and retrieves its diagram payload', () => {
    const path = diagramTabPath('mermaid', 'flowchart LR\nA --> B')

    expect(isDiagramTabPath(path)).toBe(true)
    expect(diagramFromTabPath(path)).toMatchObject({
      kind: 'mermaid',
      source: 'flowchart LR\nA --> B'
    })
    expect(diagramTitleFromTabPath(path)).toBe('Mermaid diagram')
  })

  it('returns a fallback title for stale temporary diagram tabs', () => {
    expect(diagramFromTabPath('zen://diagram/not-registered')).toBeNull()
    expect(diagramTitleFromTabPath('zen://diagram/not-registered')).toBe('Diagram')
  })
})
