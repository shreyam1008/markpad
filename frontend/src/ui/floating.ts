export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

const DEFAULT_VIEWPORT_GUTTER = 8;

export function clampFloatingPosition(
  requested: Point,
  floating: Size,
  viewport: Size,
  gutter = DEFAULT_VIEWPORT_GUTTER,
): Point {
  const maxX = Math.max(gutter, viewport.width - floating.width - gutter);
  const maxY = Math.max(gutter, viewport.height - floating.height - gutter);
  return {
    x: Math.min(Math.max(requested.x, gutter), maxX),
    y: Math.min(Math.max(requested.y, gutter), maxY),
  };
}
