export const PRODUCT_NAME = "Quillpane";
export const PREVIEW_PRODUCT_NAME = "Quillpane";
export const LEGACY_PRODUCT_NAME = "Markpad";
export const VERSION = "0.13.5";

// The custom domain is the canonical public site now that DNS, Pages, HTTPS,
// and the legacy redirect have been verified. Keep the old address explicit
// for compatibility links and migration notices.
export const WEBSITE_URL = "https://quillpane.shreyam1008.com.np/";
export const LEGACY_WEBSITE_URL = "https://shreyam1008.github.io/markpad/";
export const SOURCE_URL = "https://github.com/shreyam1008/markpad";

// Browser storage belongs to existing users. The old keys remain stable for
// the Quillpane compatibility release.
export const STORAGE_KEYS = {
  sections: "markpad-sections",
  interfaceZoom: "markpad-ui-zoom",
  textZoom: "markpad-text-zoom",
  legacyTextZoom: "markpad-zoom",
} as const;
