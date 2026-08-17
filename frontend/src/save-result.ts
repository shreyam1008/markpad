export type SaveResultKind = "saved" | "cancelled" | "unchanged";

export function classifySaveResult(options: {
  mode: "save" | "save-as";
  previousPath: string;
  nextPath: string;
  wasDirty: boolean;
  isDirty: boolean;
}): SaveResultKind {
  if (options.isDirty) return "cancelled";

  if (options.mode === "save") {
    return options.previousPath || options.nextPath ? "saved" : "cancelled";
  }

  if (options.previousPath !== options.nextPath || options.wasDirty) return "saved";

  // A clean Save As to the same path and a cancelled dialog return identical
  // session state. Keep the status deliberately neutral in that one case.
  return "unchanged";
}
