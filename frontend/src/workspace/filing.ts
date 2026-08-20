import type { DraftFormat } from "./types";

const MAX_FILE_STEM = 60;

function usefulTitle(content: string): string {
  for (const sourceLine of content.split(/\r?\n/)) {
    let line = sourceLine.trim();
    if (!line) continue;
    line = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^(?:>\s*)+/, "")
      .replace(/^(?:[-*+]\s+)(?:\[[ xX]\]\s*)?/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_~`]/g, "")
      .trim();
    if (line) return line;
  }
  return "";
}

function slug(value: string): string {
  return Array.from(
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[’']/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, ""),
  )
    .slice(0, MAX_FILE_STEM)
    .join("")
    .replace(/-+$/g, "");
}

export function suggestWorkspaceDraftPath(
  content: string,
  format: DraftFormat,
  existingRelativePaths: string[],
): string {
  const stem = slug(usefulTitle(content)) || "untitled";
  const extension = format === "txt" ? ".txt" : ".md";
  const existing = new Set(
    existingRelativePaths.map((path) => path.replaceAll("\\", "/").toLocaleLowerCase()),
  );
  let suffix = 1;
  while (true) {
    const suffixText = suffix === 1 ? "" : `-${suffix}`;
    const availableStem = Array.from(stem)
      .slice(0, MAX_FILE_STEM - suffixText.length)
      .join("")
      .replace(/-+$/g, "");
    const candidate = `${availableStem}${suffixText}${extension}`;
    if (!existing.has(candidate.toLocaleLowerCase())) return candidate;
    suffix++;
  }
}
