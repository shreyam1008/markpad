import { describe, expect, test } from "bun:test";

import {
  LEGACY_PRODUCT_NAME,
  PREVIEW_PRODUCT_NAME,
  PRODUCT_NAME,
  SOURCE_URL,
  STORAGE_KEYS,
  WEBSITE_URL,
} from "../src/brand";

describe("brand migration contract", () => {
  test("uses Quillpane as the approved display name", () => {
    expect(PRODUCT_NAME).toBe("Quillpane");
    expect(PREVIEW_PRODUCT_NAME).toBe("Quillpane");
    expect(LEGACY_PRODUCT_NAME).toBe("Markpad");
  });

  test("preserves existing browser storage keys", () => {
    expect(STORAGE_KEYS).toEqual({
      sections: "markpad-sections",
      interfaceZoom: "markpad-ui-zoom",
      textZoom: "markpad-text-zoom",
      legacyTextZoom: "markpad-zoom",
    });
  });

  test("keeps old addresses until redirects are verified", () => {
    expect(WEBSITE_URL).toBe("https://shreyam1008.github.io/markpad/");
    expect(SOURCE_URL).toBe("https://github.com/shreyam1008/markpad");
  });
});
