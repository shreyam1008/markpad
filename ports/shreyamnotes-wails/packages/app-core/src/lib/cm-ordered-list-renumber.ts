/**
 * Auto-renumber ordered Markdown lists whenever the document changes.
 *
 * When a user moves, deletes, inserts, or pastes lines that touch an
 * ordered list, the literal numeric markers (`1.`, `2.`, `3.`) move
 * with their text and end up out of sequence in the source. This
 * extension fixes that by walking ordered-list regions touched by a
 * transaction and rewriting the markers so they stay contiguous.
 *
 * Marker punctuation (`.` vs `)`) is preserved per-list from the
 * first item.
 *
 * Choice of starting number:
 *   - If the first item's marker was touched as part of a *multi-line*
 *     edit (line move, paste, deletion of the prior first item), the
 *     list is renumbered starting from 1. The marker landing in slot
 *     #1 was likely just moved into place, not authored, so its
 *     literal value isn't a meaningful start.
 *   - Otherwise, the first item's existing number is preserved (so a
 *     list deliberately authored as `5. … 6. … 7. …` keeps the start
 *     when later items get edited).
 *
 * The renumber is appended to the same transaction (via a
 * `transactionFilter` returning the original plus a sequential
 * change spec), so the move and the renumber land as a single
 * undo step.
 *
 * Programmatic edits (note swap, external file watcher) and history
 * traversal (undo / redo) opt out — programmatic loads via the
 * exported `skipOrderedListRenumber` annotation, undo/redo via the
 * CodeMirror `userEvent` they carry.
 */
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import {
  Annotation,
  EditorState,
  type ChangeSpec,
  type Extension
} from '@codemirror/state'
import type { SyntaxNode, Tree } from '@lezer/common'

/**
 * Annotation that opts a transaction out of automatic renumbering.
 * Set this on programmatic doc replacements (note switching, file
 * watcher syncs) so the user's stored content isn't rewritten on load.
 */
export const skipOrderedListRenumber = Annotation.define<boolean>()

const ORDERED_MARK_RE = /^(\d{1,9})([.)])$/

type Range = readonly [number, number]

function rangesOverlap(a: Range, b: Range): boolean {
  return a[0] <= b[1] && b[0] <= a[1]
}

/**
 * Force a complete parse so we can rely on `OrderedList` / `ListItem`
 * / `ListMark` nodes covering the changed regions. With a mounted
 * editor view this is usually a no-op (the language ViewPlugin keeps
 * the tree current); without a view (tests, programmatic dispatch
 * before the view has driven a parse) the cached tree may be empty.
 * Falls back to whatever partial tree we have if the parse budget
 * runs out — renumbering is best-effort.
 */
function getReadyTree(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state)
}

function collectOrderedLists(
  state: EditorState,
  ranges: ReadonlyArray<Range>
): SyntaxNode[] {
  const tree = getReadyTree(state)
  const found = new Map<string, SyntaxNode>()

  const record = (node: SyntaxNode): void => {
    if (node.name !== 'OrderedList') return
    const key = `${node.from}:${node.to}`
    if (!found.has(key)) found.set(key, node)
  }

  for (const [from, to] of ranges) {
    // Walk ancestors of the change start to catch lists that fully
    // contain the change region — `iterate` would only descend into
    // the deepest subtree at that position.
    let cur: SyntaxNode | null = tree.resolveInner(from, 1)
    while (cur) {
      record(cur)
      cur = cur.parent
    }
    // Then iterate down through the range to catch sibling and nested
    // lists touched by a multi-line change.
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === 'OrderedList') record(node.node)
      }
    })
  }

  return [...found.values()]
}

function appendRenumberChanges(
  state: EditorState,
  list: SyntaxNode,
  multiLineRanges: ReadonlyArray<Range>,
  out: ChangeSpec[]
): void {
  let firstNumber: number | null = null
  let punctuation: '.' | ')' = '.'
  let index = 0

  for (let child = list.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'ListItem') continue
    const mark = child.firstChild
    if (!mark || mark.name !== 'ListMark') continue
    const text = state.doc.sliceString(mark.from, mark.to)
    const match = ORDERED_MARK_RE.exec(text)
    if (!match) continue

    if (firstNumber == null) {
      const markRange: Range = [mark.from, mark.to]
      const touchedByMultiLine = multiLineRanges.some((r) =>
        rangesOverlap(r, markRange)
      )
      firstNumber = touchedByMultiLine ? 1 : Number(match[1])
      punctuation = match[2] as '.' | ')'
      const expected = `${firstNumber}${punctuation}`
      if (text !== expected) {
        out.push({ from: mark.from, to: mark.to, insert: expected })
      }
    } else {
      const expected = `${firstNumber + index}${punctuation}`
      if (text !== expected) {
        out.push({ from: mark.from, to: mark.to, insert: expected })
      }
    }
    index++
  }
}

export const orderedListRenumber: Extension = EditorState.transactionFilter.of(
  (tr) => {
    if (!tr.docChanged) return tr
    if (tr.annotation(skipOrderedListRenumber)) return tr
    if (tr.isUserEvent('undo') || tr.isUserEvent('redo')) return tr

    const oldDoc = tr.startState.doc
    const newDoc = tr.state.doc
    const ranges: Range[] = []
    const multiLineRanges: Range[] = []

    tr.changes.iterChanges((fromA, toA, fromB, toB) => {
      ranges.push([fromB, toB])
      const crossedLineInOld =
        oldDoc.lineAt(fromA).number !== oldDoc.lineAt(toA).number
      const crossedLineInNew =
        newDoc.lineAt(fromB).number !== newDoc.lineAt(toB).number
      if (crossedLineInOld || crossedLineInNew) {
        multiLineRanges.push([fromB, toB])
      }
    })

    if (ranges.length === 0) return tr

    const lists = collectOrderedLists(tr.state, ranges)
    if (lists.length === 0) return tr

    const changes: ChangeSpec[] = []
    for (const list of lists) {
      appendRenumberChanges(tr.state, list, multiLineRanges, changes)
    }
    if (changes.length === 0) return tr

    // `sequential: true` makes the extra changes apply on top of `tr`'s
    // resulting doc; CodeMirror composes the two ChangeSets into one
    // ChangeSet on a single Transaction so undo treats it as one step.
    return [
      tr,
      {
        changes,
        sequential: true,
        annotations: skipOrderedListRenumber.of(true)
      }
    ]
  }
)
