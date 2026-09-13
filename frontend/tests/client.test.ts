import { afterEach, expect, test } from "bun:test";

import { client } from "../src/workspace/client";

const originalWindow = globalThis.window;
afterEach(() => {
  globalThis.window = originalWindow;
});

test("scaled WebView scroll positions cross the Go integer boundary safely", async () => {
  let stored: unknown[] = [];
  globalThis.window = {
    go: {
      main: {
        App: {
          UpdateReadPosition: async (...args: unknown[]) => {
            if (args.slice(1).some((value) => !Number.isInteger(value)))
              throw Error("Go requires integers");
            stored = args;
          },
        },
      },
    },
  } as unknown as Window & typeof globalThis;
  await client.updateReadPosition("calendar", 515.4545288085938, 480.9090881347656, 12);
  expect(stored).toEqual(["calendar", 515, 481, 12]);
});
