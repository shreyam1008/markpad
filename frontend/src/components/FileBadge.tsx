import { fileBadge, fileType, typeLabel } from "../workspace/documents";
import { Code2, FileText, ImageIcon, Pencil, Table2, Files, HardDrive } from "./icons";

export function FileBadge({ path = "", kind = "" }: { path?: string; kind?: string }) {
  const type = fileType(path, kind);
  const Icon =
    type === "md"
      ? Pencil
      : type === "code"
        ? Code2
        : type === "image"
          ? ImageIcon
          : type === "office"
            ? Table2
            : type === "ebook"
              ? Files
              : type === "archive"
                ? HardDrive
                : FileText;
  return (
    <span
      className={`file-kind file-kind-${type}`}
      title={typeLabel(type)}
      aria-label={typeLabel(type)}
    >
      <Icon />
      <small>{fileBadge(path, kind)}</small>
    </span>
  );
}
