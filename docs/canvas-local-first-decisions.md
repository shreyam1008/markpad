# Canvas local-first decisions

Markpad should keep the drawing canvas lightweight and local-first. The canvas can learn from polished infinite-canvas apps, but the app should not vendor a heavy drawing runtime until a specific feature justifies the RAM and binary cost.

## References

- tldraw persistence: https://tldraw.dev/docs/persistence
- tldraw snapshots: https://tldraw.dev/sdk-features/persistence
- Excalidraw JSON schema: https://docs.excalidraw.com/docs/codebase/json-schema
- Excalidraw serialization utilities: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils

## Format

Use a plaintext JSON canvas file so users are not locked into Markpad.

Canonical extension: `.markcanvas.json`.

Minimum shape:

```json
{
  "type": "markpad-canvas",
  "version": 1,
  "createdAt": "2026-06-24T00:00:00Z",
  "updatedAt": "2026-06-24T00:00:00Z",
  "elements": [],
  "assets": [],
  "meta": {}
}
```

Elements should stay simple: id, kind, position, size, style, text, points, and z-index. Avoid per-frame runtime state in the file. Camera, selected tool, selection, minimap visibility, grid visibility, and snap state are session state and should stay device-local.

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
- Sticky notes: store as native JSON elements with text, fill, stroke, position, and size; derive readable fill from the existing color control; expose via toolbar, command palette, and text-only color presets; open text editing immediately after creation; include sticky text and fill in selected-element reports; and export as visible text/card content where adapters support it.
- Task bridges: render task canvas cards as sticky notes with compact loaded/local and line metadata so derived boards stay editable while Markdown task files remain the source of truth.
- Search bridges: render search result cards as sticky notes so query maps stay editable while result data remains a lightweight snapshot.
- Outline and workspace bridges: render generated heading and loaded-file cards as sticky notes to keep maps editable and reduce generated element count.
- Style controls: stroke, fill, opacity, width, font size, arrowhead, and rough/smooth line mode.
- Infinite canvas: virtualize hit testing and drawing by viewport bounds; do not keep DOM nodes for every element.
- Hint/status text: derive from existing in-memory canvas state so empty, drawing, panning, selected, active tool, grid, snap, minimap, and pressed-button states teach the surface without extra persisted data.
- Toolbar labels: use text buttons, titles, and ARIA labels on existing controls instead of image assets or icon fonts.
- Assets: use inline SVG icons or CSS shapes; avoid icon fonts and large image packs.
