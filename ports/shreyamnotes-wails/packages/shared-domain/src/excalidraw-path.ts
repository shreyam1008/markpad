export const EXCALIDRAW_EXT = '.excalidraw'

export function isExcalidrawPath(path: string | null | undefined): boolean {
  return typeof path === 'string' && path.toLowerCase().endsWith(EXCALIDRAW_EXT)
}

/** Display title for a drawing (filename without the `.excalidraw` extension). */
export function excalidrawTitleFromPath(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.toLowerCase().endsWith(EXCALIDRAW_EXT)
    ? base.slice(0, -EXCALIDRAW_EXT.length)
    : base
}

/** Obsidian's default Excalidraw drawing filename suffix. */
export const OBSIDIAN_EXCALIDRAW_SUFFIX = '.excalidraw.md'

/** True for an Obsidian Excalidraw drawing by filename (`*.excalidraw.md`). */
export function isObsidianExcalidrawPath(path: string | null | undefined): boolean {
  return typeof path === 'string' && path.toLowerCase().endsWith(OBSIDIAN_EXCALIDRAW_SUFFIX)
}

/**
 * True if the markdown carries Obsidian's `excalidraw-plugin` frontmatter marker.
 * Covers drawings saved as a plain `.md` (not only `*.excalidraw.md`).
 */
export function isObsidianExcalidrawMarkdown(
  content: string | null | undefined
): boolean {
  if (typeof content !== 'string') return false
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatter) return false
  return /^excalidraw-plugin:\s*\S/m.test(frontmatter[1])
}
