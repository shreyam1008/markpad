(() => {
  const context = navigator.modelContext;
  if (!context?.registerTool && !context?.provideContext) return;

  const origin = window.location.origin;
  const tools = [
    {
      name: "get_quillpane_release",
      description: "Return the current public Quillpane release and its GitHub release URL.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => ({ version: "0.13.4", name: "Quillpane", url: "https://github.com/shreyam1008/markpad/releases/tag/v0.13.4" })
    },
    {
      name: "open_quillpane_resource",
      description: "Open a public Quillpane documentation or discovery resource.",
      inputSchema: {
        type: "object",
        properties: { resource: { type: "string", enum: ["llms", "architecture", "behavior", "launch", "packaging", "skills", "apiCatalog", "openapi"] } },
        required: ["resource"],
        additionalProperties: false
      },
      execute: (input = {}) => {
        const paths = {
          llms: "/llms.txt", architecture: "/architecture.md", behavior: "/behavior.md", launch: "/launch.md",
          packaging: "/packaging.md", skills: "/.well-known/agent-skills/index.json", apiCatalog: "/.well-known/api-catalog", openapi: "/openapi.json"
        };
        const url = origin + (paths[String(input.resource || "llms")] || paths.llms);
        window.open(url, "_blank", "noopener,noreferrer");
        return { url };
      }
    }
  ];

  if (context.registerTool) {
    const controller = new AbortController();
    window.addEventListener("pagehide", () => controller.abort(), { once: true });
    tools.forEach((tool) => {
      try { void context.registerTool(tool, { signal: controller.signal }); } catch {}
    });
  }
  if (context.provideContext) void context.provideContext({ tools });
})();
