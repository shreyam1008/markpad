import { describe, expect, test } from "bun:test";

import { clampFloatingPosition } from "../src/ui/floating";

describe("clampFloatingPosition", () => {
  test("keeps a menu at the requested point when it fits", () => {
    expect(
      clampFloatingPosition(
        { x: 120, y: 90 },
        { width: 180, height: 240 },
        { width: 1180, height: 760 },
      ),
    ).toEqual({ x: 120, y: 90 });
  });

  test("moves a menu inward at the right and bottom edges", () => {
    expect(
      clampFloatingPosition(
        { x: 1130, y: 720 },
        { width: 180, height: 240 },
        { width: 1180, height: 760 },
      ),
    ).toEqual({ x: 992, y: 512 });
  });

  test("keeps an oversized menu reachable in a narrow viewport", () => {
    expect(
      clampFloatingPosition(
        { x: -40, y: -20 },
        { width: 400, height: 700 },
        { width: 320, height: 480 },
      ),
    ).toEqual({ x: 8, y: 8 });
  });
});
