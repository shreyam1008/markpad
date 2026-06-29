/**
 * Drag-and-drop opening of markdown files from the OS.
 *
 * A document-level capture handler intercepts markdown files dropped
 * anywhere on the window and hands them to the caller, which decides what
 * "open" means for the platform:
 *
 *  - Desktop resolves each File to an absolute path and opens it in place
 *    (vault note or standalone external-file window).
 *  - The web build has no OS filesystem, so it reads the dropped contents
 *    and imports them as new notes.
 *
 * Either way the handler:
 *  - Blocks the browser's default navigate-to-file behaviour for every OS
 *    file drag (so a stray drop never tears the app out of the window), and
 *  - Claims (stopPropagation) only markdown drags — other files (images,
 *    PDFs) keep flowing to the editor's attachment importer downstream.
 *
 * Internal drags (tabs, image blocks, in-editor text moves) set custom
 * `dataTransfer` types and never include `'Files'`, so they're ignored.
 */

const MARKDOWN_NAME_RE = /\.(md|markdown)$/i

/** True only for a real OS file drag (as opposed to an in-app drag). */
export function isOsFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes('Files')
}

/** Dropped files whose name ends in `.md` / `.markdown`. */
export function markdownFilesFromDrop(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return []
  return Array.from(dataTransfer.files).filter((file) => MARKDOWN_NAME_RE.test(file.name))
}

export interface MarkdownFileDropDeps {
  /** Handle the markdown files dropped onto the window. */
  onMarkdownFiles: (files: File[]) => void
}

/**
 * Install the capture-phase dragover/drop handlers on `target` (normally
 * `document`). Returns a cleanup function that removes them.
 */
export function installMarkdownFileDropHandler(
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  deps: MarkdownFileDropDeps
): () => void {
  const onDragOver = (event: Event): void => {
    const e = event as DragEvent
    if (!isOsFileDrag(e.dataTransfer)) return
    // Mark the window as a drop target so the drop fires even outside the
    // editor's own drop zones and the OS shows a copy cursor.
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (event: Event): void => {
    const e = event as DragEvent
    if (!isOsFileDrag(e.dataTransfer)) return
    const files = markdownFilesFromDrop(e.dataTransfer)
    // Stop the browser from navigating to the dropped file regardless. Only
    // claim the event (stopPropagation) for markdown; other files still reach
    // the editor's importer downstream.
    e.preventDefault()
    if (files.length === 0) return
    e.stopPropagation()
    deps.onMarkdownFiles(files)
  }

  target.addEventListener('dragover', onDragOver, true)
  target.addEventListener('drop', onDrop, true)
  return () => {
    target.removeEventListener('dragover', onDragOver, true)
    target.removeEventListener('drop', onDrop, true)
  }
}
