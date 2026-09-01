let initialized = false;

function designToken(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export async function renderMermaidDiagrams(nodes: HTMLElement[], isCurrent: () => boolean) {
  if (!nodes.length || !isCurrent()) return;
  const { default: mermaid } = await import("mermaid");
  if (!isCurrent()) return;

  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      maxTextSize: 50_000,
      maxEdges: 500,
      theme: "base",
      themeVariables: {
        fontFamily: designToken("--mp-font-body"),
        primaryColor: designToken("--mp-selected"),
        primaryTextColor: designToken("--mp-selected-text"),
        primaryBorderColor: designToken("--mp-selected-border"),
        lineColor: designToken("--mp-muted"),
        secondaryColor: designToken("--mp-chrome"),
        tertiaryColor: designToken("--mp-paper"),
        background: designToken("--mp-paper"),
      },
      flowchart: { htmlLabels: false, useMaxWidth: true },
    });
    initialized = true;
  }

  for (const node of nodes) {
    if (!isCurrent() || !node.isConnected) return;
    node.setAttribute("aria-busy", "true");
    node.setAttribute("aria-label", "Mermaid diagram");
    const source = node.textContent ?? "";
    try {
      const valid = await mermaid.parse(source, { suppressErrors: true });
      if (!valid) throw new Error("Invalid Mermaid diagram");
      await mermaid.run({ nodes: [node], suppressErrors: true });
      node.removeAttribute("aria-busy");
    } catch {
      node.removeAttribute("aria-busy");
      node.classList.add("mermaid-error");
      node.setAttribute("aria-label", "Mermaid diagram could not be rendered");
    }
  }
}
