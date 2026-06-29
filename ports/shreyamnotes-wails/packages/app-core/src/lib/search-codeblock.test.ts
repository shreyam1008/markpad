// @vitest-environment jsdom

import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import {
  HighlightStyle,
  LanguageDescription,
  defaultHighlightStyle,
  syntaxHighlighting
} from '@codemirror/language'
import { SearchQuery, openSearchPanel, search, setSearchQuery } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { describe, expect, it, vi } from 'vitest'
import { livePreviewPlugin } from './cm-live-preview'

vi.mock('../store', () => {
  const state = {
    activeNote: null,
    assetFiles: [],
    noteRefs: {},
    pdfEmbedInEditMode: 'compact',
    pinnedRefKind: 'note',
    pinnedRefPath: null,
    vault: null
  }
  const useStore = Object.assign(() => null, {
    getState: () => state,
    subscribe: () => () => {}
  })
  return { useStore }
})

const paperHighlight = HighlightStyle.define([
  { tag: t.monospace, class: 'tok-monospace' },
  { tag: t.keyword, class: 'tok-keyword' },
  { tag: t.string, class: 'tok-string' },
  { tag: t.variableName, class: 'tok-variable' },
  { tag: t.definition(t.variableName), class: 'tok-variable-def' }
])

const resolveCodeLanguage = (info: string): LanguageDescription | null => {
  if (info === 'js' || info === 'javascript')
    return LanguageDescription.of({
      name: 'javascript',
      support: javascript()
    })
  return null
}

function mountEditor(doc: string): EditorView {
  const parent = document.createElement('div')
  document.body.append(parent)
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        markdown({
          base: markdownLanguage,
          codeLanguages: resolveCodeLanguage
        }),
        syntaxHighlighting(paperHighlight),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        livePreviewPlugin,
        search()
      ]
    })
  })
}

function runSearch(view: EditorView, query: string): void {
  openSearchPanel(view)
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({ search: query, caseSensitive: false, regexp: false })
    )
  })
}

describe('search highlight reaches code-block content', () => {
  it('highlights matches inside a fenced code block with a language', () => {
    const view = mountEditor(
      ['Prose target line.', '', '```js', 'const target = 1;', '```'].join('\n')
    )
    runSearch(view, 'target')

    const matches = Array.from(view.dom.querySelectorAll('.cm-searchMatch'))
    expect(matches.length).toBeGreaterThanOrEqual(2)
    // The in-code match should wrap the language-tagged token so the
    // background can shine through the syntax highlight.
    const inCode = matches.find((el) => el.querySelector('.tok-variable-def'))
    expect(inCode).toBeTruthy()
    expect(inCode?.textContent).toBe('target')

    view.destroy()
  })

  it('highlights matches inside a plain fenced code block', () => {
    const view = mountEditor(
      ['Prose target line.', '', '```', 'target inside a plain block', '```'].join('\n')
    )
    runSearch(view, 'target')

    const matchedTexts = Array.from(view.dom.querySelectorAll('.cm-searchMatch')).map(
      (el) => el.textContent
    )
    expect(matchedTexts.filter((text) => text === 'target').length).toBeGreaterThanOrEqual(2)

    view.destroy()
  })

  it('highlights matches inside inline backtick code without being occluded by the chip background', () => {
    const view = mountEditor('Some plain target and inline `target` code.')
    runSearch(view, 'target')

    const matches = Array.from(view.dom.querySelectorAll('.cm-searchMatch'))
    // Both the prose match and the inline-code match must be present.
    expect(matches.map((el) => el.textContent)).toEqual(['target', 'target'])
    const inCodeMatch = matches.find((el) => el.querySelector('.tok-monospace'))
    expect(inCodeMatch).toBeTruthy()
  })
})
