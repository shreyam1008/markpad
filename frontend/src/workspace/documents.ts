import type { FileType, NoteInfo, OutlineItem, ViewMode } from "./types";

const markdown = new Set(["md", "markdown", "mdx"]);
const text = new Set(["txt", "log", "csv", "tsv"]);
const code = new Set([
  "json",
  "jsonc",
  "yaml",
  "yml",
  "xml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "properties",
  "env",
  "gitignore",
  "editorconfig",
  "py",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "go",
  "rs",
  "rb",
  "lua",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "php",
  "swift",
  "kt",
  "dart",
  "r",
  "sql",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "svg",
  "vue",
  "svelte",
  "dockerfile",
  "cmake",
  "ex",
  "exs",
  "nim",
  "zig",
  "tf",
  "gradle",
  "pl",
]);
const images = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "ico"]);
const ebooks = new Set(["epub", "mobi", "azw", "azw3", "fb2"]);
const office = new Set(["doc", "docx", "odt", "rtf", "pages"]);
const archives = new Set(["zip", "tar", "gz", "bz2", "xz", "7z", "rar"]);

export function fileExtension(path = ""): string {
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : name;
}

export function fileType(path = "", kind = ""): FileType {
  if (kind === "markdown") return "md";
  if (kind === "text") return "text";
  if (kind === "code") return "code";
  if (["pdf", "image", "ebook", "office", "archive"].includes(kind)) {
    return kind as FileType;
  }
  const extension = fileExtension(path);
  if (markdown.has(extension)) return "md";
  if (text.has(extension)) return "text";
  if (code.has(extension)) return "code";
  if (extension === "pdf") return "pdf";
  if (images.has(extension)) return "image";
  if (ebooks.has(extension)) return "ebook";
  if (office.has(extension)) return "office";
  if (archives.has(extension)) return "archive";
  return "text";
}

export function isReadOnly(type: FileType): boolean {
  return ["pdf", "image", "ebook", "office", "archive"].includes(type);
}

export function availableViews(type: FileType): ViewMode[] {
  if (isReadOnly(type)) return ["viewer"];
  if (type === "md") return ["markdown", "split", "viewer"];
  return ["markdown", "viewer"];
}

export function defaultView(note?: NoteInfo): ViewMode {
  if (!note) return "markdown";
  const supported = availableViews(fileType(note.path, note.kind));
  if (note.viewMode && supported.includes(note.viewMode)) return note.viewMode;
  if (!note.path && supported.includes("markdown")) return "markdown";
  return supported.includes("viewer") ? "viewer" : supported[0];
}

export function viewLabel(type: FileType, mode: ViewMode): string {
  if (mode === "markdown") return "Editor";
  if (mode === "split") return "Split";
  if (type === "md") return "Preview";
  if (type === "code") return "Code View";
  return "Viewer";
}

export function typeLabel(type: FileType): string {
  const labels: Record<FileType, string> = {
    md: "Markdown",
    text: "Text",
    code: "Code",
    pdf: "PDF",
    image: "Image",
    ebook: "Ebook",
    office: "Office",
    archive: "Archive",
  };
  return labels[type];
}

export function fileBadge(path = "", kind = ""): string {
  const type = fileType(path, kind);
  const extension = fileExtension(path);
  if (type === "md") return "MD";
  if (type === "text") return extension === "log" ? "LOG" : "TXT";
  if (type === "pdf") return "PDF";
  if (type === "image") return "IMG";
  if (type === "ebook") return "EPUB";
  if (type === "office") return "DOC";
  if (type === "archive") return "ZIP";
  if (["yaml", "yml"].includes(extension)) return "YML";
  if (extension === "toml") return "TOML";
  return extension ? extension.slice(0, 4).toUpperCase() : "CODE";
}

export function outlineFromMarkdown(content: string): OutlineItem[] {
  const result: OutlineItem[] = [];
  content.split("\n").forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (match) result.push({ level: match[1].length, text: match[2], line: index });
  });
  return result;
}

export function editorStats(content: string, note?: NoteInfo) {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const extension = fileExtension(note?.path);
  return {
    label: extension ? extension.toUpperCase() : typeLabel(fileType(note?.path, note?.kind)),
    lines: content ? content.split("\n").length : 0,
    words,
    characters: content.length,
    readMinutes: Math.max(1, Math.ceil(words / 200)),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function imageMime(path: string): string {
  const extension = fileExtension(path);
  if (extension === "jpg") return "image/jpeg";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "ico") return "image/x-icon";
  return `image/${extension || "png"}`;
}

export function openFileDirty(
  path: string,
  notes: NoteInfo[],
  activeId: string,
  activeDirty: boolean,
): { dirty: boolean; noteId?: string } {
  const note = notes.find((item) => item.path === path);
  if (!note) return { dirty: false };
  return {
    dirty: note.id === activeId ? activeDirty : note.dirty,
    noteId: note.id,
  };
}
