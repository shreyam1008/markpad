/**
 * Most-recently-used tracking for the command palette. Persisted to
 * localStorage so the "Recent" section survives restarts. Stores a generous
 * backlog (more than we display) so that when some recents are currently
 * unavailable — their `when()` guard is false — there are still enough left to
 * fill the visible slots.
 */
const STORAGE_KEY = 'zen:command-history:v1'

/** How many ids we keep on disk. */
const MAX_STORED = 16

/** How many recents the palette surfaces at the top. */
export const RECENT_COMMAND_COUNT = 3

export function loadRecentCommandIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_STORED)
  } catch {
    return []
  }
}

/**
 * Move `id` to the front of the recents list and persist. Returns the new list
 * so callers can update local state without a re-read.
 */
export function recordCommandUse(id: string): string[] {
  const next = [id, ...loadRecentCommandIds().filter((existing) => existing !== id)].slice(
    0,
    MAX_STORED
  )
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Persistence is best-effort (private mode / quota); ignore failures.
    }
  }
  return next
}
