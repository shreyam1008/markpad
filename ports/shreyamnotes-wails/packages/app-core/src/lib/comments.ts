import type { NoteComment } from '@shared/ipc'

export interface ResolvedCommentAnchor {
  from: number
  to: number
}

export function resolveCommentAnchor(
  comment: Pick<NoteComment, 'anchorStart' | 'anchorEnd' | 'anchorText'>,
  doc: string
): ResolvedCommentAnchor {
  const docLength = doc.length
  const from = Math.max(0, Math.min(docLength, comment.anchorStart))
  const to = Math.max(from, Math.min(docLength, comment.anchorEnd))
  const selected = doc.slice(from, to)
  if (!comment.anchorText || selected === comment.anchorText) {
    return { from, to }
  }
  const found = doc.indexOf(comment.anchorText)
  if (found >= 0) return { from: found, to: found + comment.anchorText.length }
  return { from, to }
}

export function selectionToCommentAnchor(
  doc: string,
  from: number,
  to: number
): Pick<NoteComment, 'anchorStart' | 'anchorEnd' | 'anchorText'> {
  const start = Math.max(0, Math.min(doc.length, Math.min(from, to)))
  const end = Math.max(start, Math.min(doc.length, Math.max(from, to)))
  const selected = doc.slice(start, end).replace(/\s+/g, ' ').trim()
  return {
    anchorStart: start,
    anchorEnd: end,
    anchorText: selected.slice(0, 500)
  }
}

export function commentQuote(comment: Pick<NoteComment, 'anchorText'>): string {
  return comment.anchorText.trim() || 'Current cursor position'
}
