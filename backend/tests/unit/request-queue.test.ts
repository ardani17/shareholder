import { describe, it, expect } from 'vitest';
import { RequestQueue } from '../../src/core/request-queue.js';

describe('RequestQueue', () => {
  it('should process enqueued items and resolve their promises', async () => {
    const queue = new RequestQueue();
    const result = await queue.enqueue(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('should reject promise when the enqueued function throws', async () => {
    const queue = new RequestQueue();
    await expect(
      queue.enqueue(() => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom');
  });

  it('should process items in FIFO order', async () => {
    const queue = new RequestQueue();
    const order: number[] = [];

    const p1 = queue.enqueue(async () => { order.push(1); return 1; });
    const p2 = queue.enqueue(async () => { order.push(2); return 2; });
    const p3 = queue.enqueue(async () => { order.push(3); return 3; });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('should report correct size', async () => {
    const queue = new RequestQueue();
    // Pause so items accumulate
    queue.pause();

    queue.enqueue(() => Promise.resolve('a')).catch(() => {});
    queue.enqueue(() => Promise.resolve('b')).catch(() => {});

    expect(queue.size()).toBe(2);

    queue.clear();
    expect(queue.size()).toBe(0);
  });

  it('clear() should reject all pending promises', async () => {
    const queue = new RequestQueue();
    queue.pause();

    const p1 = queue.enqueue(() => Promise.resolve(1));
    const p2 = queue.enqueue(() => Promise.resolve(2));

    queue.clear();

    await expect(p1).rejects.toThrow('Queue cleared');
    await expect(p2).rejects.toThrow('Queue cleared');
  });

  it('pause() should stop processing new items', async () => {
    const queue = new RequestQueue();
    const order: number[] = [];

    // First item will start processing immediately
    const p1 = queue.enqueue(async () => { order.push(1); return 1; });
    await p1;

    queue.pause();
    expect(queue.isPaused()).toBe(true);

    // These should not execute while paused
    const p2 = queue.enqueue(async () => { order.push(2); return 2; });

    // Give a tick for any async processing
    await new Promise(r => setTimeout(r, 10));
    expect(order).toEqual([1]);
    expect(queue.size()).toBe(1);

    // Resume and let it drain
    queue.resume();
    await p2;
    expect(order).toEqual([1, 2]);
  });

  it('resume() should continue processing remaining items', async () => {
    const queue = new RequestQueue();
    queue.pause();

    const results: string[] = [];
    const p1 = queue.enqueue(async () => { results.push('a'); return 'a'; });
    const p2 = queue.enqueue(async () => { results.push('b'); return 'b'; });

    expect(queue.size()).toBe(2);

    queue.resume();
    await Promise.all([p1, p2]);

    expect(results).toEqual(['a', 'b']);
    expect(queue.size()).toBe(0);
  });

  it('isPaused() should reflect current state', () => {
    const queue = new RequestQueue();
    expect(queue.isPaused()).toBe(false);
    queue.pause();
    expect(queue.isPaused()).toBe(true);
    queue.resume();
    expect(queue.isPaused()).toBe(false);
  });

  it('should process items one at a time (no concurrency)', async () => {
    const queue = new RequestQueue();
    let concurrent = 0;
    let maxConcurrent = 0;

    const makeTask = (id: number) => queue.enqueue(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      // Simulate async work
      await new Promise(r => setTimeout(r, 5));
      concurrent--;
      return id;
    });

    const promises = [makeTask(1), makeTask(2), makeTask(3)];
    await Promise.all(promises);

    expect(maxConcurrent).toBe(1);
  });
});
