type Mermaid = typeof import("mermaid").default;

declare const __QUILLPANE_DIAGRAM_SCRIPT__: string;
declare global {
  interface Window {
    quillpaneDiagrams?: Mermaid;
  }
}

let pending: Promise<Mermaid> | undefined;

export function loadMermaid(): Promise<Mermaid> {
  // Dev and WebKitGTK retain the existing, single-module loading path.
  if (typeof __QUILLPANE_DIAGRAM_SCRIPT__ === "undefined" || !__QUILLPANE_DIAGRAM_SCRIPT__) {
    return import("mermaid").then((module) => module.default);
  }
  if (window.quillpaneDiagrams) return Promise.resolve(window.quillpaneDiagrams);
  if (pending) return pending;
  pending = new Promise<Mermaid>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(__QUILLPANE_DIAGRAM_SCRIPT__, document.baseURI).href;
    script.async = true;
    script.onload = () => {
      if (window.quillpaneDiagrams) resolve(window.quillpaneDiagrams);
      else reject(new Error("The local diagram renderer did not initialize"));
    };
    script.onerror = () => reject(new Error("Could not load the local diagram renderer"));
    document.head.append(script);
  }).catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
