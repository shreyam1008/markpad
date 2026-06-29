import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { ExternalFileContent, ExternalFileKind } from '@shared/ipc'
import { PlainTextFileEditor } from './PlainTextFileEditor'

const ExternalMarkdownFileEditor = lazy(async () => {
  const module = await import('./ExternalMarkdownFileEditor')
  return { default: module.ExternalMarkdownFileEditor }
})

const CODE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.lua',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.svelte',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
  '.zig'
])

const PLAIN_EXTENSIONS = new Set(['.csv', '.env', '.log', '.text', '.tsv', '.txt'])

function extensionFor(name: string): string {
  const clean = name.split(/[?#]/)[0] ?? name
  const index = clean.lastIndexOf('.')
  return index >= 0 ? clean.slice(index).toLowerCase() : ''
}

function inferKind(content: ExternalFileContent): ExternalFileKind {
  if (content.kind) return content.kind
  const ext = extensionFor(content.name || content.path)
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (PLAIN_EXTENSIONS.has(ext) || ext === '') return 'plain'
  return 'plain'
}

export function ExternalFileApp(): JSX.Element {
  const [content, setContent] = useState<ExternalFileContent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.zen
      .readExternalFile()
      .then((next) => {
        if (!alive) return
        setContent(next)
      })
      .catch((err) => {
        if (!alive) return
        console.error('readExternalFile failed', err)
        setError(err instanceof Error ? err.message : 'Could not read this file.')
      })
    return () => {
      alive = false
    }
  }, [])

  const kind = useMemo(() => (content ? inferKind(content) : 'plain'), [content])

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-paper-100 px-6 text-center text-sm text-ink-500">
        {error}
      </div>
    )
  }

  if (!content) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-paper-100 text-sm text-ink-400">
        Loading...
      </div>
    )
  }

  if (kind === 'markdown') {
    return (
      <Suspense
        fallback={
          <div className="flex h-screen w-screen items-center justify-center bg-paper-100 text-sm text-ink-400">
            Loading editor...
          </div>
        }
      >
        <ExternalMarkdownFileEditor initialContent={{ ...content, kind }} />
      </Suspense>
    )
  }

  return <PlainTextFileEditor initialContent={{ ...content, kind }} />
}
