# Canvas local-first decisions

Markpad should keep the drawing canvas lightweight and local-first. The canvas can learn from polished infinite-canvas apps, but the app should not vendor a heavy drawing runtime until a specific feature justifies the RAM and binary cost.

## References

- tldraw persistence: https://tldraw.dev/docs/persistence
- tldraw snapshots: https://tldraw.dev/sdk-features/persistence
- Excalidraw JSON schema: https://docs.excalidraw.com/docs/codebase/json-schema
- Excalidraw serialization utilities: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils

## Format

Use a plaintext JSON canvas file so users are not locked into Markpad.

Suggested extension: `.mpcanvas.json`.

Minimum shape:

```json
{
  "type": "markpad-canvas",
  "version": 1,
  "createdAt": "2026-06-24T00:00:00Z",
  "updatedAt": "2026-06-24T00:00:00Z",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "elements": [],
  "assets": []
}
```

Elements should stay simple: id, kind, position, size, style, text, points, and z-index. Avoid per-frame runtime state in the file.

## Save model

- Save by writing a compact JSON payload to a temp file in the same folder, then atomically replace the target file.
- Debounce canvas writes; do not serialize on every pointer move.
- Keep undo history in memory only and rebuild the scene from the JSON file on load.
- Store binary assets as separate files beside the canvas when possible; avoid base64 blobs in the main canvas JSON unless the user explicitly embeds them.

## Compatibility

- Excalidraw uses plaintext JSON for `.excalidraw` files, so Markpad should support export to Excalidraw after the native format is stable.
- tldraw snapshots are JSON-serializable full-document snapshots, but importing the SDK would be a deliberate future tradeoff, not the default implementation.
- The native Markpad canvas should prioritize fast local load, small memory footprint, and simple import/export adapters over runtime feature parity with either project.

## UI budget

- Core tools: select, pan, pencil, rectangle, ellipse, line, arrow, text, sticky note, eraser.
- Style controls: stroke, fill, opacity, width, font size, arrowhead, and rough/smooth line mode.
- Infinite canvas: virtualize hit testing and drawing by viewport bounds; do not keep DOM nodes for every element.
- Assets: use inline SVG icons or CSS shapes; avoid icon fonts and large image packs.
