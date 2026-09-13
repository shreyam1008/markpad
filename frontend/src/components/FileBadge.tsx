import { fileBadge, fileType, typeLabel } from "../workspace/documents";
import { Kanban } from "./icons";

export function FileBadge({
  path = "",
  kind = "",
  taskBoard = false,
}: {
  path?: string;
  kind?: string;
  taskBoard?: boolean;
}) {
  const type = fileType(path, kind);
  if (taskBoard && type === "md")
    return (
      <span
        className="file-kind file-kind-tasks"
        title="Task board · Markdown"
        aria-label="Task board"
      >
        <Kanban />
      </span>
    );
  return (
    <span
      className={`file-kind file-kind-${type}`}
      title={typeLabel(type)}
      aria-label={typeLabel(type)}
    >
      {fileBadge(path, kind)}
    </span>
  );
}
