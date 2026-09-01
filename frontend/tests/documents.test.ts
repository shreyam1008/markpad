import { describe, expect, test } from "bun:test";

import {
  availableViews,
  defaultView,
  fileBadge,
  fileType,
  isReadOnly,
  openFileDirty,
  outlineFromMarkdown,
} from "../src/workspace/documents";
import type { NoteInfo } from "../src/workspace/types";

const note = (values: Partial<NoteInfo> = {}): NoteInfo => ({
  id: "1",
  title: "Untitled",
  path: "",
  dirty: false,
  star: false,
  kind: "markdown",
  viewMode: "",
  size: 0,
  scrollTop: 0,
  viewTop: 0,
  cursor: 0,
  ...values,
});

describe("document rules", () => {
  test("classifies the supported file families", () => {
    const families = {
      md: ["README.md", "guide.markdown", "page.mdx"],
      text: ["notes.txt", "server.log", "data.csv", "table.tsv", "README"],
      code: [
        "config.json",
        "config.yaml",
        "main.go",
        "component.tsx",
        "styles.css",
        "query.sql",
        "changes.diff",
        "fix.patch",
        "Dockerfile",
        ".editorconfig",
      ],
      pdf: ["manual.pdf"],
      image: ["photo.png", "photo.jpeg", "diagram.webp", "icon.ico"],
      ebook: ["book.epub", "book.mobi", "book.azw3"],
      office: ["brief.docx", "notes.rtf", "draft.pages"],
      archive: ["source.zip", "backup.tar", "bundle.7z", "files.rar"],
    } as const;
    for (const [family, paths] of Object.entries(families)) {
      for (const path of paths) expect(fileType(path, "")).toBe(family);
    }
  });

  test("keeps binary document families read-only and badges compact", () => {
    for (const family of ["pdf", "image", "ebook", "office", "archive"] as const) {
      expect(isReadOnly(family)).toBe(true);
      expect(availableViews(family)).toEqual(["viewer"]);
    }
    expect(fileBadge("component.tsx")).toBe("TSX");
    expect(fileBadge("settings.yaml")).toBe("YML");
    expect(fileBadge("photo.jpeg")).toBe("IMG");
  });

  test("only markdown supports split", () => {
    expect(availableViews("md")).toEqual(["markdown", "split", "viewer"]);
    expect(availableViews("code")).toEqual(["markdown", "viewer"]);
    expect(availableViews("pdf")).toEqual(["viewer"]);
  });

  test("new drafts edit while saved files view", () => {
    expect(defaultView(note())).toBe("markdown");
    expect(defaultView(note({ path: "/tmp/note.md" }))).toBe("viewer");
    expect(defaultView(note({ path: "/tmp/note.md", viewMode: "split" }))).toBe("split");
  });

  test("extracts markdown outline positions", () => {
    expect(outlineFromMarkdown("# One\ntext\n## Two")).toEqual([
      { level: 1, text: "One", line: 0 },
      { level: 2, text: "Two", line: 2 },
    ]);
  });

  test("uses live active dirty state for deletion warnings", () => {
    const active = note({ id: "active", path: "/notes/live.md", dirty: false });
    const background = note({ id: "background", path: "/notes/other.md", dirty: true });

    expect(openFileDirty(active.path, [active, background], active.id, true)).toEqual({
      dirty: true,
      noteId: "active",
    });
    expect(openFileDirty(background.path, [active, background], active.id, false)).toEqual({
      dirty: true,
      noteId: "background",
    });
    expect(openFileDirty("/notes/closed.md", [active], active.id, true)).toEqual({
      dirty: false,
    });
  });
});
