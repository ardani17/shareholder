// Request Queue — FIFO queue for managing sequential request execution

interface QueueItem<T = unknown> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export class RequestQueue {
  private _queue: QueueItem[] = [];
  private _paused = false;
  private _processing = false;

  /**
   * Add a request function to the queue.
   * Returns a Promise that resolves/rejects when the request is executed.
   */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this._queue.push({ fn, resolve, reject } as QueueItem);
      this._processNext();
    });
  }

  /** Return current queue size (pending items not yet executed). */
  size(): number {
    return this._queue.length;
  }

  /** Clear all pending items, rejecting their promises. */
  clear(): void {
    const pending = this._queue.splice(0);
    for (const item of pending) {
      item.reject(new Error('Queue cleared'));
    }
  }

  /** Pause processing — no new items will be dequeued. */
  pause(): void {
    this._paused = true;
  }

  /** Resume processing and continue draining the queue. */
  resume(): void {
    this._paused = false;
    this._processNext();
  }

  /** Return whether the queue is currently paused. */
  isPaused(): boolean {
    return this._paused;
  }

  // --- internal ---

  private async _processNext(): Promise<void> {
    if (this._processing || this._paused || this._queue.length === 0) {
      return;
    }

    this._processing = true;

    while (this._queue.length > 0 && !this._paused) {
      const item = this._queue.shift()!;
      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }

    this._processing = false;
  }
}
