export function createAsyncQueue() {
  let tail: Promise<unknown> = Promise.resolve();

  return function enqueue<T>(task: () => T | Promise<T>): Promise<T> {
    const result = tail.then(task);

    // Keep later work moving and attach a rejection handler even when callers
    // intentionally fire-and-forget a background mutation.
    tail = result.catch(() => undefined);
    return result;
  };
}
