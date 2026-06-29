import type { PastedImageInput } from '@shared/ipc'

const IMAGE_FILE_EXTENSION_RE = /\.(apng|avif|gif|jpe?g|png|svg|webp)$/i

export function isClipboardImageFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith('image/')) return true
  return IMAGE_FILE_EXTENSION_RE.test(file.name)
}

export function pastedImageFilesFromClipboard(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return []
  const direct = Array.from(dataTransfer.files ?? []).filter(isClipboardImageFile)
  if (direct.length > 0) return direct

  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file && isClipboardImageFile(file))
}

export async function pastedImageInputFromFile(file: File): Promise<PastedImageInput> {
  return {
    data: await file.arrayBuffer(),
    mimeType: file.type || 'image/png',
    suggestedName: file.name || null
  }
}
