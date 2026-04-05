import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FloodController } from '../../src/core/flood-controller.js';
import { ApiRateLimitError } from '../../src/core/api-client.js';

// Use fast timers for tests
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Helper: advance timers while allowing microtasks to flush */
async function advanceTime(ms: number) {
  vi.advanceTimersByTime(ms);
  // flush microtask queue
  await vi.runAllTimersAsync();
}

describe('FloodController', () => {
  describe('constructor & config', () => {
    it('uses default config when none provided', () => {
      const fc = new FloodController();
      expect(fc.getConfig()).toEqual({
        delayMs: 1000,
        maxConcurrency: 1,
        maxRetries: 5,
        initialBackoffMs: 5000,
      });
    });

    it('merges partial config with defaults', () => {
      const fc = new FloodController({ delayMs: 500, maxConcurrency: 3 });
      expect(fc.getConfig()).toEqual({
        delayMs: 500,
        maxConcurrency: 3,
        maxRetries: 5,
        initialBackoffMs: 5000,
      });
    });
  });

  describe('updateConfig', () => {
    it('merges partial into current config', () => {
      const fc = new FloodController();
      fc.updateConfig({ delayMs: 200 });
      expect(fc.getConfig().delayMs).toBe(200);
      expect(fc.getConfig().maxConcurrency).toBe(1); // unchanged
    });
  });

  describe('stats', () => {
    it('starts with zero stats', () => {
      const fc = new FloodController();
      expect(fc.getStats()).toEqual({
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        retryCount: 0,
        avgResponseTimeMs: 0,
        consecutive429Count: 0,
      });
    });

    it('resetStats clears all stats', async () => {
      const fc = new FloodController({ delayMs: 0 });
      const p = fc.execute(() => Promise.resolve('ok'));
      await advanceTime(0);
      await p;
      expect(fc.getStats().totalRequests).toBe(1);
      fc.resetStats();
      expect(fc.getStats().totalRequests).toBe(0);
    });
  });

  describe('pause / resume', () => {
    it('isPaused returns correct state', () => {
      const fc = new FloodController();
      expect(fc.isPaused()).toBe(false);
      fc.pause();
      expect(fc.isPaused()).toBe(true);
      fc.resume();
      expect(fc.isPaused()).toBe(false);
    });
  });

  describe('execute', () => {
    it('resolves with the function result on success', async () => {
      const fc = new FloodController({ delayMs: 0 });
      const p = fc.execute(() => Promise.resolve(42));
      await advanceTime(0);
      const result = await p;
      expect(result).toBe(42);
    });

    it('increments totalRequests and successCount on success', async () => {
      const fc = new FloodController({ delayMs: 0 });
      const p = fc.execute(() => Promise.resolve('ok'));
      await advanceTime(0);
      await p;
      const stats = fc.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(0);
    });

    it('increments failureCount on non-429 error', async () => {
      vi.useRealTimers();
      const fc = new FloodController({ delayMs: 0 });
      await expect(fc.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
      const stats = fc.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.failureCount).toBe(1);
      expect(stats.successCount).toBe(0);
      vi.useFakeTimers();
    });

    it('retries on ApiRateLimitError with exponential backoff', async () => {
      vi.useRealTimers();
      const fc = new FloodController({ delayMs: 0, initialBackoffMs: 1, maxRetries: 3 });
      let callCount = 0;
      const fn = () => {
        callCount++;
        if (callCount <= 2) throw new ApiRateLimitError();
        return Promise.resolve('recovered');
      };

      const result = await fc.execute(fn);
      expect(result).toBe('recovered');
      expect(callCount).toBe(3);
      expect(fc.getStats().retryCount).toBe(2);
      expect(fc.getStats().consecutive429Count).toBe(0); // reset on success
      vi.useFakeTimers();
    });

    it('fails after maxRetries exhausted', async () => {
      vi.useRealTimers();
      const fc = new FloodController({ delayMs: 0, initialBackoffMs: 1, maxRetries: 2 });
      const fn = () => { throw new ApiRateLimitError(); };

      await expect(fc.execute(fn)).rejects.toBeInstanceOf(ApiRateLimitError);
      expect(fc.getStats().failureCount).toBe(1);
      vi.useFakeTimers();
    });

    it('auto-pauses after 3 consecutive 429 errors', async () => {
      vi.useRealTimers();
      const fc = new FloodController({ delayMs: 0, initialBackoffMs: 1, maxRetries: 2 });
      // With maxRetries=2: initial call + 2 retries = 3 calls total, all 429
      // The 3rd consecutive 429 triggers auto-pause.
      // Since retryAttempt=2 >= maxRetries=2, it also fails immediately.
      const fn = () => { throw new ApiRateLimitError(); };

      await expect(fc.execute(fn)).rejects.toBeInstanceOf(ApiRateLimitError);
      // After 3 consecutive 429s, should be paused
      expect(fc.isPaused()).toBe(true);
      expect(fc.getStats().consecutive429Count).toBe(3);
      vi.useFakeTimers();
    });

    it('resets consecutive429Count on success', async () => {
      vi.useRealTimers();
      const fc = new FloodController({ delayMs: 0, initialBackoffMs: 1, maxRetries: 5 });
      let callCount = 0;
      const fn = () => {
        callCount++;
        if (callCount <= 1) throw new ApiRateLimitError();
        return Promise.resolve('ok');
      };

      const result = await fc.execute(fn);
      expect(result).toBe('ok');
      expect(fc.getStats().consecutive429Count).toBe(0);
      vi.useFakeTimers();
    });

    it('waits for resume when paused before executing', async () => {
      const fc = new FloodController({ delayMs: 0 });
      fc.pause();

      let resolved = false;
      const p = fc.execute(() => Promise.resolve('done')).then(v => {
        resolved = true;
        return v;
      });

      await advanceTime(100);
      expect(resolved).toBe(false);

      fc.resume();
      await advanceTime(0);
      const result = await p;
      expect(result).toBe('done');
      expect(resolved).toBe(true);
    });
  });

  describe('concurrency limiting', () => {
    it('respects maxConcurrency limit', async () => {
      vi.useRealTimers();
      const fc = new FloodController({ delayMs: 0, maxConcurrency: 2 });
      let concurrent = 0;
      let maxConcurrent = 0;

      const makeTask = () => {
        return fc.execute(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise(r => setTimeout(r, 20));
          concurrent--;
          return 'done';
        });
      };

      const results = await Promise.all([makeTask(), makeTask(), makeTask()]);
      expect(results).toEqual(['done', 'done', 'done']);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
      vi.useFakeTimers();
    });
  });
});
