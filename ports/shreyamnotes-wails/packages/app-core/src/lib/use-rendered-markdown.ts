import { useEffect, useRef, useState } from 'react'
import { recordRendererPerf } from './perf'

export interface SettledMarkdownState {
  key: string
  markdown: string
}

export function resolveSettledMarkdownSnapshot(
  markdown: string,
  key: string,
  settled: SettledMarkdownState
): {
  settledMarkdown: string
  isStale: boolean
} {
  if (settled.key !== key) {
    return {
      settledMarkdown: markdown,
      isStale: false
    }
  }
  return {
    settledMarkdown: settled.markdown,
    isStale: settled.markdown !== markdown
  }
}

export function useSettledMarkdown(
  markdown: string,
  delayMs = 75,
  resetKey = ''
): {
  settledMarkdown: string
  isStale: boolean
} {
  const requestedAtRef = useRef(performance.now())
  const [settled, setSettled] = useState<SettledMarkdownState>(() => ({
    key: resetKey,
    markdown
  }))
  const { settledMarkdown, isStale } = resolveSettledMarkdownSnapshot(
    markdown,
    resetKey,
    settled
  )

  useEffect(() => {
    requestedAtRef.current = performance.now()
    if (settled.key !== resetKey || delayMs <= 0) {
      if (settled.key !== resetKey || settled.markdown !== markdown) {
        setSettled({ key: resetKey, markdown })
      }
      return
    }
    if (settled.markdown === markdown) {
      return
    }
    const timer = window.setTimeout(() => {
      setSettled({ key: resetKey, markdown })
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, markdown, resetKey, settled.key, settled.markdown])

  useEffect(() => {
    if (isStale) return
    recordRendererPerf('preview.settled-latency', performance.now() - requestedAtRef.current, {
      chars: markdown.length
    })
  }, [isStale, markdown, settledMarkdown])

  return {
    settledMarkdown,
    isStale
  }
}
