import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createFloodConfigRouter } from '../../src/controllers/flood-config.controller.js';
import type { FloodController } from '../../src/core/flood-controller.js';
import type { FloodControlConfig, FloodControlStats } from '../../src/types.js';

const DEFAULT_CONFIG: FloodControlConfig = {
  delayMs: 1000,
  maxConcurrency: 1,
  maxRetries: 5,
  initialBackoffMs: 5000,
};

function createMockFloodController(overrides: Partial<Record<string, unknown>> = {}): FloodController {
  return {
    getConfig: vi.fn().mockReturnValue({ ...DEFAULT_CONFIG }),
    updateConfig: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      totalRequests: 0, successCount: 0, failureCount: 0,
      retryCount: 0, avgResponseTimeMs: 0, consecutive429Count: 0,
    } as FloodControlStats),
    resetStats: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: vi.fn().mockReturnValue(false),
    execute: vi.fn(),
    ...overrides,
  } as unknown as FloodController;
}

function request(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      reject(new Error('Server not listening'));
      return;
    }
    const payload = body ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
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
    if (payload) req.write(payload);
    req.end();
  });
}

function createTestApp(floodController: FloodController): http.Server {
  const app = express();
  app.use(express.json());
  app.use('/api/flood-control', createFloodConfigRouter(floodController));
  return app.listen(0);
}

describe('Flood Config Controller', () => {
  let server: http.Server;

  afterEach(() => {
    if (server) server.close();
  });

  describe('GET /api/flood-control/config', () => {
    it('should return 200 with current config', async () => {
      const mock = createMockFloodController();
      server = createTestApp(mock);

      const res = await request(server, 'GET', '/api/flood-control/config');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(DEFAULT_CONFIG);
      expect(mock.getConfig).toHaveBeenCalled();
    });

    it('should return 500 when getConfig throws', async () => {
      const mock = createMockFloodController({
        getConfig: vi.fn().mockImplementation(() => { throw new Error('boom'); }),
      });
      server = createTestApp(mock);

      const res = await request(server, 'GET', '/api/flood-control/config');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });

  describe('PUT /api/flood-control/config', () => {
    it('should return 200 with updated config when valid field provided', async () => {
      const updatedConfig = { ...DEFAULT_CONFIG, delayMs: 2000 };
      const mock = createMockFloodController({
        getConfig: vi.fn().mockReturnValue(updatedConfig),
      });
      server = createTestApp(mock);

      const res = await request(server, 'PUT', '/api/flood-control/config', { delayMs: 2000 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updatedConfig);
      expect(mock.updateConfig).toHaveBeenCalledWith({ delayMs: 2000 });
    });

    it('should return 400 when no valid config field provided', async () => {
      const mock = createMockFloodController();
      server = createTestApp(mock);

      const res = await request(server, 'PUT', '/api/flood-control/config', { invalidField: 123 });

      expect(res.status).toBe(400);
      expect(mock.updateConfig).not.toHaveBeenCalled();
    });

    it('should return 400 when body is empty', async () => {
      const mock = createMockFloodController();
      server = createTestApp(mock);

      const res = await request(server, 'PUT', '/api/flood-control/config', {});

      expect(res.status).toBe(400);
      expect(mock.updateConfig).not.toHaveBeenCalled();
    });

    it('should return 500 when updateConfig throws', async () => {
      const mock = createMockFloodController({
        updateConfig: vi.fn().mockImplementation(() => { throw new Error('boom'); }),
      });
      server = createTestApp(mock);

      const res = await request(server, 'PUT', '/api/flood-control/config', { delayMs: 500 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });
});
