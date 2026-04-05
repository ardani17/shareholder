import type { FloodControlConfig, FloodControlStats } from '../types.js';
import { ApiRateLimitError } from './api-client.js';

const DEFAULT_CONFIG: FloodControlConfig = {
  delayMs: 1000,
  maxConcurrency: 1,
  maxRetries: 5,
  initialBackoffMs: 5000,
};

const EMPTY_STATS: FloodControlStats = {
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  retryCount: 0,
  avgResponseTimeMs: 0,
  consecutive429Count: 0,
};

const AUTO_PAUSE_THRESHOLD = 3;

export class FloodController {
  private _config: FloodControlConfig;
  private _stats: FloodControlStats;
  private _paused = false;
  private _activeCount = 0;
  private _totalResponseTimeMs = 0;

  // Waiters for pause/resume
  private _resumeWaiters: Array<() => void> = [];
  // Waiters for concurrency slots
  private _concurrencyWaiters: Array<() => void> = [];

  constructor(config?: Partial<FloodControlConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._stats = { ...EMPTY_STATS };
  }

  getConfig(): FloodControlConfig {
    return { ...this._config };
  }

  updateConfig(partial: Partial<FloodControlConfig>): void {
    this._config = { ...this._config, ...partial };
  }

  getStats(): FloodControlStats {
    return { ...this._stats };
  }

  resetStats(): void {
    this._stats = { ...EMPTY_STATS };
    this._totalResponseTimeMs = 0;
  }

  pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
    // Wake up all waiters blocked on pause
    const waiters = this._resumeWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }

  isPaused(): boolean {
    return this._paused;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Wait if paused
    await this._waitIfPaused();

    // Wait for delay between requests
    await this._delay(this._config.delayMs);

    // Wait for concurrency slot
    await this._acquireConcurrencySlot();

    this._stats.totalRequests++;

    const startTime = Date.now();
    let retryAttempt = 0;

    try {
      while (true) {
        // Check pause before each attempt
        await this._waitIfPaused();

        try {
          const result = await fn();

          // Success — reset consecutive 429 counter
          this._stats.consecutive429Count = 0;
          this._stats.successCount++;
          this._recordResponseTime(Date.now() - startTime);
          return result;
        } catch (error) {
          if (error instanceof ApiRateLimitError) {
            this._stats.consecutive429Count++;
            this._stats.retryCount++;

            // Auto-pause when consecutive 429 count reaches threshold
            if (this._stats.consecutive429Count >= AUTO_PAUSE_THRESHOLD) {
              this.pause();
            }

            if (retryAttempt >= this._config.maxRetries) {
              // Exhausted retries
              this._stats.failureCount++;
              this._recordResponseTime(Date.now() - startTime);
              throw error;
            }

            // Exponential backoff: initialBackoffMs * 2^retryAttempt
            const backoffMs = this._config.initialBackoffMs * Math.pow(2, retryAttempt);
            await this._delay(backoffMs);

            // Wait if auto-paused
            await this._waitIfPaused();

            retryAttempt++;
          } else {
            // Non-429 error — fail immediately
            this._stats.failureCount++;
            this._recordResponseTime(Date.now() - startTime);
            throw error;
          }
        }
      }
    } finally {
      this._releaseConcurrencySlot();
    }
  }

  // --- Private helpers ---

  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private _waitIfPaused(): Promise<void> {
    if (!this._paused) {
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this._resumeWaiters.push(resolve);
    });
  }

  private async _acquireConcurrencySlot(): Promise<void> {
    while (this._activeCount >= this._config.maxConcurrency) {
      await new Promise<void>(resolve => {
        this._concurrencyWaiters.push(resolve);
      });
    }
    this._activeCount++;
  }

  private _releaseConcurrencySlot(): void {
    this._activeCount--;
    // Wake up one waiter for the freed slot
    const waiter = this._concurrencyWaiters.shift();
    if (waiter) {
      waiter();
    }
  }

  private _recordResponseTime(ms: number): void {
    this._totalResponseTimeMs += ms;
    const completedCount = this._stats.successCount + this._stats.failureCount;
    this._avgResponseTimeMs = completedCount > 0
      ? this._totalResponseTimeMs / completedCount
      : 0;
    this._stats.avgResponseTimeMs = this._avgResponseTimeMs;
  }

  private _avgResponseTimeMs = 0;
}
