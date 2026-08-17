import { describe, expect, test } from "bun:test";

import { errorMessage, escapeHtml } from "../src/safe-html";

describe("escapeHtml", () => {
  test("escapes text and quoted-attribute delimiters", () => {
    expect(escapeHtml(`<report & notes> "today's"`)).toBe(
      "&lt;report &amp; notes&gt; &quot;today&#39;s&quot;",
    );
  });

  test("renders missing metadata as empty text", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("errorMessage", () => {
  test("normalizes Error instances and non-Error rejections", () => {
    expect(errorMessage(new Error("read failed"))).toBe("read failed");
    expect(errorMessage("permission denied")).toBe("permission denied");
    expect(errorMessage(null)).toBe("Unknown error");
  });
});
