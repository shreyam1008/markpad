import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import {
  EditorState,
  type ChangeSpec,
  type TransactionSpec
} from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  orderedListRenumber,
  skipOrderedListRenumber
} from './cm-ordered-list-renumber'

function makeState(doc: string): EditorState {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage }), orderedListRenumber]
  })
  // Force a full parse so the transactionExtender can rely on a
  // complete syntax tree when it walks for OrderedList nodes.
  ensureSyntaxTree(state, doc.length, 5_000)
  return state
}

function applyAndRead(
  doc: string,
  changes: ChangeSpec,
  opts: Pick<TransactionSpec, 'annotations'> = {}
): string {
  const state = makeState(doc)
  return state.update({ changes, ...opts }).state.doc.toString()
}

describe('orderedListRenumber', () => {
  it('renumbers when a line is moved down past another item', () => {
    // Simulates Alt+Down on the first item: line-swap of "1. one" and "2. two".
    const result = applyAndRead('1. one\n2. two\n3. three', {
      from: 0,
      to: 13,
      insert: '2. two\n1. one'
    })
    expect(result).toBe('1. two\n2. one\n3. three')
  })

  it('renumbers after a middle item is deleted', () => {
    // Delete "2. b\n" (positions 5..10). Survivors should be 1, 2, 3.
    const result = applyAndRead('1. a\n2. b\n3. c\n4. d', {
      from: 5,
      to: 10,
      insert: ''
    })
    expect(result).toBe('1. a\n2. c\n3. d')
  })

  it('renumbers when the first item itself is deleted', () => {
    // Delete "1. a\n" — second item slides to top, should become 1.
    const result = applyAndRead('1. a\n2. b\n3. c', {
      from: 0,
      to: 5,
      insert: ''
    })
    expect(result).toBe('1. b\n2. c')
  })

  it('renumbers after pasting a new item between existing ones', () => {
    // Insert "1. new\n" after the first line. Surviving items renumber.
    const result = applyAndRead('1. a\n2. b\n3. c', {
      from: 5,
      to: 5,
      insert: '1. new\n'
    })
    expect(result).toBe('1. a\n2. new\n3. b\n4. c')
  })

  it('preserves a non-1 starting number for in-place edits', () => {
    // User edits later items only — start number 5 stays.
    const result = applyAndRead('5. a\n6. b\n7. c', {
      from: 14,
      to: 14,
      insert: ' tail'
    })
    expect(result).toBe('5. a\n6. b\n7. c tail')
  })

  it('fixes a single out-of-order number from a single-line edit', () => {
    // Replace "7" with "9" on the third line; renumber should restore 7.
    const result = applyAndRead('5. a\n6. b\n7. c', {
      from: 10,
      to: 11,
      insert: '9'
    })
    expect(result).toBe('5. a\n6. b\n7. c')
  })

  it('preserves marker punctuation `)` per list', () => {
    const result = applyAndRead('1) a\n5) b\n9) c', {
      from: 14,
      to: 14,
      insert: ' '
    })
    expect(result).toBe('1) a\n2) b\n3) c ')
  })

  it('leaves bullet lists alone', () => {
    const result = applyAndRead('- one\n- two\n- three', {
      from: 5,
      to: 5,
      insert: ' x'
    })
    expect(result).toBe('- one x\n- two\n- three')
  })

  it('leaves numbered-looking lines inside a fenced code block alone', () => {
    const doc = '```\n1. one\n5. two\n```'
    const result = applyAndRead(doc, {
      from: doc.length,
      to: doc.length,
      insert: '\n'
    })
    expect(result).toBe('```\n1. one\n5. two\n```\n')
  })

  it('skips renumbering when skipOrderedListRenumber is set', () => {
    const result = applyAndRead(
      '1. a\n5. b\n9. c',
      { from: 14, to: 14, insert: ' ' },
      { annotations: skipOrderedListRenumber.of(true) }
    )
    expect(result).toBe('1. a\n5. b\n9. c ')
  })

  it('renumbers a nested ordered list independently of its outer list', () => {
    // Inner list's third item is mis-numbered (`5.`). Touching the
    // inner list triggers renumbering of just that nested list — the
    // outer list's numbering, already correct, is left alone.
    const initial = '1. outer a\n   1. inner a\n   2. inner b\n   5. inner c\n2. outer b'
    const innerEnd = initial.indexOf('inner c') + 'inner c'.length
    const result = applyAndRead(initial, {
      from: innerEnd,
      to: innerEnd,
      insert: '!'
    })
    expect(result).toBe(
      '1. outer a\n   1. inner a\n   2. inner b\n   3. inner c!\n2. outer b'
    )
  })

  it('does not re-trigger on undo (single undo step covers the whole edit)', () => {
    // Simulate the move-line-down flow: dispatch the user transaction
    // through the filter (so the renumber is appended), then dispatch
    // an undo-tagged transaction reversing the composed change. The
    // undo dispatch should pass through untouched.
    const before = '1. one\n2. two\n3. three'
    const state = makeState(before)
    const moved = state.update({
      changes: { from: 0, to: 13, insert: '2. two\n1. one' }
    })
    expect(moved.state.doc.toString()).toBe('1. two\n2. one\n3. three')

    const undone = moved.state.update({
      changes: moved.changes.invert(state.doc),
      userEvent: 'undo'
    })
    expect(undone.state.doc.toString()).toBe(before)
  })
})
