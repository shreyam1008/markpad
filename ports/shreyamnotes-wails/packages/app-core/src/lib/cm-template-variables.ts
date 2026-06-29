import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'

export interface TemplateVariable {
  /** Token name matched after `{{` (e.g. "date:FORMAT"). */
  name: string
  /** Text inserted when chosen. */
  insert: string
  detail: string
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { name: 'title', insert: '{{title}}', detail: 'The note title' },
  { name: 'date', insert: '{{date}}', detail: "Today's date (YYYY-MM-DD)" },
  { name: 'date:FORMAT', insert: '{{date:YYYY-MM-DD}}', detail: 'Custom date format' },
  { name: 'time', insert: '{{time}}', detail: 'Current time (HH:mm)' },
  { name: 'week', insert: '{{week}}', detail: 'ISO week number' },
  { name: 'cursor', insert: '{{cursor}}', detail: 'Where the caret lands' }
]

/**
 * CodeMirror autocomplete source for template `{{variables}}`. Triggers once
 * `{{` has been typed and replaces the partial token with the full `{{…}}`.
 */
export function templateVariableSource(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const before = state.doc.sliceString(line.from, pos)
  const match = before.match(/\{\{\s*([a-zA-Z:]*)$/)
  if (!match) return null
  const from = pos - match[0].length
  const query = match[1].toLowerCase()
  const options: Completion[] = TEMPLATE_VARIABLES.filter(
    (variable) => !query || variable.name.toLowerCase().includes(query)
  ).map(
    (variable) =>
      ({
        label: variable.insert,
        detail: variable.detail,
        type: 'variable',
        // Read by the shared slash-command renderer (`slashCommandRender`) so
        // these rows render with the same icon/label/detail layout.
        _icon: '{}',
        apply: (view: EditorView, _completion: Completion, _from: number, to: number) => {
          view.dispatch({
            changes: { from, to, insert: variable.insert },
            selection: { anchor: from + variable.insert.length }
          })
        }
      }) as Completion
  )
  if (options.length === 0) return null
  return { from, options, filter: false }
}
