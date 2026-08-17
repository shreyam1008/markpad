import { describe, expect, test } from "bun:test";

import { createAsyncQueue } from "../src/async-queue";

describe("createAsyncQueue", () => {
  test("runs asynchronous work in enqueue order", async () => {
    const enqueue = createAsyncQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = enqueue(async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
    });
    const second = enqueue(() => {
      events.push("second");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  test("continues after a rejected task", async () => {
    const enqueue = createAsyncQueue();
    const failed = enqueue(() => {
      throw new Error("mutation failed");
    });
    const recovered = enqueue(() => "saved");

    await expect(failed).rejects.toThrow("mutation failed");
    await expect(recovered).resolves.toBe("saved");
  });
});
