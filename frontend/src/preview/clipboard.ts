// DOM selection belongs to the rendered pane, independently of editor focus.
export function previewSelection(root: HTMLElement, selection: Selection | null): string {
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode)
    return "";
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return "";
  return selection.toString();
}

export async function writeClipboard(text: string): Promise<void> {
  if (!text) return; // Never replace the clipboard with an empty preview selection.
  if (window.runtime?.ClipboardSetText) {
    if (!(await window.runtime.ClipboardSetText(text))) throw new Error("Clipboard write failed");
    return;
  }
  await navigator.clipboard.writeText(text);
}
