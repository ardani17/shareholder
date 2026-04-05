import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createStatusRouter } from '../../src/controllers/status.controller.js';
import type { Fetcher } from '../../src/core/fetcher.js';
import type { FloodController } from '../../src/core/flood-controller.js';
import type { FetchProgress, FloodControlConfig, FloodControlStats } from '../../src/types.js';
import type pg from 'pg';

const DEFAULT_CONFIG: FloodControlConfig = {
  delayMs: 1000,
  maxConcurrency: 1,
  maxRetries: 5,
  initialBackoffMs: 5000,
};

const DEFAULT_STATS: FloodControlStats = {
  totalRequests: 10,
  successCount: 8,
  failureCount: 2,
  retryCount: 1,
  avgResponseTimeMs: 150,
  consecutive429Count: 0,
};

const DEFAULT_PROGRESS: FetchProgress = {
  total: 100,
  success: 50,
  failed: 5,
  pending: 45,
  isRunning: true,
  isPaused: false,
};

function createMockPool(queryResult?: unknown, shouldThrow = false): pg.Pool {
  const query = shouldThrow
    ? vi.fn().mockRejectedValue(new Error('DB connection failed'))
    : vi.fn().mockResolvedValue(queryResult ?? { rows: [{ '?column?': 1 }] });
  return { query } as unknown as pg.Pool;
}

function createMockFetcher(overrides: Partial<Record<string, unknown>> = {}): Fetcher {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    getProgress: vi.fn().mockResolvedValue(DEFAULT_PROGRESS),
    ...overrides,
  } as unknown as Fetcher;
}

function createMockFloodController(overrides: Partial<Record<string, unknown>> = {}): FloodController {
  return {
    getConfig: vi.fn().mockReturnValue({ ...DEFAULT_CONFIG }),
    updateConfig: vi.fn(),
    getStats: vi.fn().mockReturnValue({ ...DEFAULT_STATS }),
    resetStats: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: vi.fn().mockReturnValue(false),
    execute: vi.fn(),
    ...overrides,
  } as unknown as FloodController;
}

function request(server: http.Server, method: string, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      reject(new Error('Server not listening'));
      return;
    }
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 500, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 500, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function createTestApp(pool: pg.Pool, fetcher: Fetcher, floodController: FloodController): http.Server {
  const app = express();
  app.use(express.json());
  app.use('/api', createStatusRouter(pool, fetcher, floodController));
  return app.listen(0);
}

describe('Status Controller', () => {
  let server: http.Server;

  afterEach(() => {
    if (server) server.close();
  });

  describe('GET /api/status', () => {
    it('should return 200 with full status when DB is connected', async () => {
      const pool = createMockPool();
      const fetcher = createMockFetcher();
      const flood = createMockFloodController();
      server = createTestApp(pool, fetcher, flood);

      const res = await request(server, 'GET', '/api/status');

      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.database).toBe('connected');
      expect(body.fetch).toEqual(DEFAULT_PROGRESS);
      expect(body.floodControl).toEqual({ ...DEFAULT_CONFIG, ...DEFAULT_STATS });
    });

    it('should return database disconnected when pool.query fails', async () => {
      const pool = createMockPool(undefined, true);
      const fetcher = createMockFetcher();
      const flood = createMockFloodController();
      server = createTestApp(pool, fetcher, flood);

      const res = await request(server, 'GET', '/api/status');

      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.database).toBe('disconnected');
      expect(body.fetch).toEqual(DEFAULT_PROGRESS);
    });

    it('should return 500 when fetcher.getProgress throws', async () => {
      const pool = createMockPool();
      const fetcher = createMockFetcher({
        getProgress: vi.fn().mockRejectedValue(new Error('fetch error')),
      });
      const flood = createMockFloodController();
      server = createTestApp(pool, fetcher, flood);

      const res = await request(server, 'GET', '/api/status');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });

    it('should return 500 when floodController.getConfig throws', async () => {
      const pool = createMockPool();
      const fetcher = createMockFetcher();
      const flood = createMockFloodController({
        getConfig: vi.fn().mockImplementation(() => { throw new Error('config error'); }),
      });
      server = createTestApp(pool, fetcher, flood);

      const res = await request(server, 'GET', '/api/status');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });
});
