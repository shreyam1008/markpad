export const PRODUCT_NAME = "Quillpane";
export const PREVIEW_PRODUCT_NAME = "Quillpane";
export const LEGACY_PRODUCT_NAME = "Markpad";
export const VERSION = "0.13.2";

// These addresses stay stable until the repository/domain transfer has landed
// and redirect behavior has been verified.
export const WEBSITE_URL = "https://shreyam1008.github.io/markpad/";
export const SOURCE_URL = "https://github.com/shreyam1008/markpad";

// Browser storage belongs to existing users. The old keys remain stable for
// the Quillpane compatibility release.
export const STORAGE_KEYS = {
  sections: "markpad-sections",
  interfaceZoom: "markpad-ui-zoom",
  textZoom: "markpad-text-zoom",
  legacyTextZoom: "markpad-zoom",
} as const;
