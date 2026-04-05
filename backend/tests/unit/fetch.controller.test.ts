import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createFetchRouter } from '../../src/controllers/fetch.controller.js';
import type { Fetcher } from '../../src/core/fetcher.js';
import type { FetchProgress } from '../../src/types.js';

function createMockFetcher(overrides: Partial<Record<keyof Fetcher, unknown>> = {}): Fetcher {
  const defaultProgress: FetchProgress = {
    total: 10,
    success: 3,
    failed: 1,
    pending: 6,
    isRunning: false,
    isPaused: false,
  };

  return {
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    getProgress: vi.fn().mockResolvedValue(defaultProgress),
    ...overrides,
  } as unknown as Fetcher;
}

/** Helper to make HTTP requests to the test server */
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

function createTestApp(fetcher: Fetcher): http.Server {
  const app = express();
  app.use(express.json());
  app.use('/api/fetch', createFetchRouter(fetcher));
  return app.listen(0); // random port
}

describe('Fetch Controller', () => {
  let server: http.Server;
  let mockFetcher: Fetcher;

  beforeEach(() => {
    if (server) server.close();
  });

  describe('POST /api/fetch/start', () => {
    it('should return 200 and start batch fetch when not running', async () => {
      mockFetcher = createMockFetcher();
      server = createTestApp(mockFetcher);

      const res = await request(server, 'POST', '/api/fetch/start');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Batch fetch started' });
      expect(mockFetcher.start).toHaveBeenCalled();

      server.close();
    });

    it('should return 409 when batch is already running', async () => {
      const runningProgress: FetchProgress = {
        total: 10, success: 3, failed: 1, pending: 6,
        isRunning: true, isPaused: false,
      };
      mockFetcher = createMockFetcher({ getProgress: vi.fn().mockResolvedValue(runningProgress) });
      server = createTestApp(mockFetcher);

      const res = await request(server, 'POST', '/api/fetch/start');

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: 'Batch fetch already running' });
      expect(mockFetcher.start).not.toHaveBeenCalled();

      server.close();
    });

    it('should return 500 when getProgress throws', async () => {
      mockFetcher = createMockFetcher({ getProgress: vi.fn().mockRejectedValue(new Error('DB error')) });
      server = createTestApp(mockFetcher);

      const res = await request(server, 'POST', '/api/fetch/start');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });

      server.close();
    });
  });

  describe('POST /api/fetch/pause', () => {
    it('should return 200 and call fetcher.pause()', async () => {
      mockFetcher = createMockFetcher();
      server = createTestApp(mockFetcher);

      const res = await request(server, 'POST', '/api/fetch/pause');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Batch fetch paused' });
      expect(mockFetcher.pause).toHaveBeenCalled();

      server.close();
    });

    it('should return 500 when pause throws', async () => {
      mockFetcher = createMockFetcher({
        pause: vi.fn().mockImplementation(() => { throw new Error('pause error'); }),
      });
      server = createTestApp(mockFetcher);

      const res = await request(server, 'POST', '/api/fetch/pause');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });

      server.close();
    });
  });

  describe('POST /api/fetch/resume', () => {
    it('should return 200 and call fetcher.resume()', async () => {
      mockFetcher = createMockFetcher();
      server = createTestApp(mockFetcher);

      const res = await request(server, 'POST', '/api/fetch/resume');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Batch fetch resumed' });
      expect(mockFetcher.resume).toHaveBeenCalled();

      server.close();
    });

    it('should return 500 when resume throws', async () => {
      mockFetcher = createMockFetcher({
        resume: vi.fn().mockImplementation(() => { throw new Error('resume error'); }),
      });
      server = createTestApp(mockFetcher);

      const res = await request(server, 'POST', '/api/fetch/resume');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });

      server.close();
    });
  });

  describe('GET /api/fetch/progress', () => {
    it('should return 200 with FetchProgress object', async () => {
      const expectedProgress: FetchProgress = {
        total: 10, success: 3, failed: 1, pending: 6,
        isRunning: false, isPaused: false,
      };
      mockFetcher = createMockFetcher({ getProgress: vi.fn().mockResolvedValue(expectedProgress) });
      server = createTestApp(mockFetcher);

      const res = await request(server, 'GET', '/api/fetch/progress');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expectedProgress);

      server.close();
    });

    it('should return 500 when getProgress throws', async () => {
      mockFetcher = createMockFetcher({ getProgress: vi.fn().mockRejectedValue(new Error('DB error')) });
      server = createTestApp(mockFetcher);

      const res = await request(server, 'GET', '/api/fetch/progress');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });

      server.close();
    });
  });
});
