export interface DraftState {
  content: string;
  dirty: boolean;
}

// One acknowledged string reference, not a queue of full-document edit snapshots.
// Task metadata is encoded in the source and therefore participates in equality.
class ValueSync<T> {
  private acknowledged: T | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private flushing: Promise<boolean> | undefined;

  constructor(
    initial: T,
    private readonly write: (value: T) => Promise<void>,
    private readonly same: (left: T | undefined, right: T) => boolean,
  ) {
    this.acknowledged = initial;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.tail.catch(() => undefined).then(operation);
    this.tail = pending;
    return pending;
  }

  // MarkDirty, Save and Revert also mutate the backend. Invalidate both before
  // queueing and at execution, so an earlier in-flight write cannot hide them.
  mutate<T>(operation: () => Promise<T>): Promise<T> {
    this.acknowledged = undefined;
    return this.enqueue(async () => {
      this.acknowledged = undefined;
      try {
        return await operation();
      } finally {
        this.acknowledged = undefined;
      }
    });
  }

  flush(current: () => T): Promise<boolean> {
    if (this.flushing) return this.flushing;
    const pending = this.drain(current);
    this.flushing = pending;
    const finished = () => {
      if (this.flushing === pending) this.flushing = undefined;
    };
    void pending.then(finished, finished);
    return pending;
  }

  private async drain(current: () => T): Promise<boolean> {
    let changed = false;
    while (true) {
      const pending = this.enqueue(async () => {
        const draft = current();
        if (this.same(this.acknowledged, draft)) return false;
        await this.write(draft);
        this.acknowledged = draft;
        return true;
      });
      changed = (await pending) || changed;
      // Include edits and backend mutations made while the bridge was awaiting.
      if (this.tail === pending && this.same(this.acknowledged, current())) return changed;
    }
  }
}

export class DraftSync extends ValueSync<DraftState> {
  constructor(initial: DraftState, write: (draft: DraftState) => Promise<void>) {
    super(
      initial,
      write,
      (left, right) => left?.content === right.content && left.dirty === right.dirty,
    );
  }
}

export interface ReadPosition {
  editor: number;
  viewer: number;
  cursor: number;
}

function rounded(value: ReadPosition): ReadPosition {
  return {
    editor: Math.round(value.editor),
    viewer: Math.round(value.viewer),
    cursor: Math.round(value.cursor),
  };
}

export class ReadPositionSync extends ValueSync<ReadPosition> {
  constructor(initial: ReadPosition, write: (position: ReadPosition) => Promise<void>) {
    super(
      rounded(initial),
      write,
      (left, right) =>
        left?.editor === right.editor &&
        left.viewer === right.viewer &&
        left.cursor === right.cursor,
    );
  }

  override flush(current: () => ReadPosition): Promise<boolean> {
    return super.flush(() => rounded(current()));
  }
}
