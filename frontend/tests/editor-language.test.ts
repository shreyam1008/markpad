import { describe, expect, test } from "bun:test";

import { languageKeyForPath } from "../src/components/CodeEditor";

describe("source editor language routing", () => {
  test("uses the rich parser for JavaScript families", () => {
    expect(languageKeyForPath("src/app.js")).toBe("javascript");
    expect(languageKeyForPath("src/component.tsx")).toBe("typescript");
    expect(languageKeyForPath("package.json")).toBe("json");
  });

  test("routes common editable source extensions to lazy modes", () => {
    expect(languageKeyForPath("main.py")).toBe("python");
    expect(languageKeyForPath("server.go")).toBe("go");
    expect(languageKeyForPath("query.sql")).toBe("sql");
    expect(languageKeyForPath("theme.scss")).toBe("scss");
    expect(languageKeyForPath("config.yaml")).toBe("yaml");
  });

  test("keeps aliases for static-only and C-family source files", () => {
    expect(languageKeyForPath("Dockerfile")).toBe("dockerfile");
    expect(languageKeyForPath("native.cpp")).toBe("cpp");
    expect(languageKeyForPath("Main.java")).toBe("java");
  });

  test("keeps unknown extensions editable as plain source", () => {
    expect(languageKeyForPath("notes.nim")).toBe("nim");
    expect(languageKeyForPath("README")).toBe("readme");
  });
});
