import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createShareholderRouter, createEmitenRouter } from '../../src/controllers/shareholder.controller.js';
import type pg from 'pg';

// Mock the shareholder service
vi.mock('../../src/services/shareholder.service.js', () => ({
  getAllShareholders: vi.fn(),
  getEmitensByShareholder: vi.fn(),
  getShareholdersByEmiten: vi.fn(),
}));

import * as shareholderService from '../../src/services/shareholder.service.js';

const mockGetAll = vi.mocked(shareholderService.getAllShareholders);
const mockGetEmitens = vi.mocked(shareholderService.getEmitensByShareholder);
const mockGetShareholders = vi.mocked(shareholderService.getShareholdersByEmiten);

const fakePool = {} as pg.Pool;

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

describe('Shareholder Controller', () => {
  let server: http.Server;

  afterEach(() => {
    if (server) server.close();
    vi.clearAllMocks();
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/shareholders', createShareholderRouter(fakePool));
    app.use('/api/emitens', createEmitenRouter(fakePool));
    return app.listen(0);
  }

  describe('GET /api/shareholders', () => {
    it('should return 200 with shareholder list', async () => {
      const mockResult = {
        data: [{ name: 'Pemerintah RI', emitenCount: 15 }],
        completeness: { processedEmitens: 850, totalEmitens: 900 },
      };
      mockGetAll.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(mockGetAll).toHaveBeenCalledWith(fakePool, undefined);
    });

    it('should pass search query param to service', async () => {
      const mockResult = {
        data: [{ name: 'Pemerintah RI', emitenCount: 15 }],
        completeness: { processedEmitens: 850, totalEmitens: 900 },
      };
      mockGetAll.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders?search=pemerintah');

      expect(res.status).toBe(200);
      expect(mockGetAll).toHaveBeenCalledWith(fakePool, 'pemerintah');
    });

    it('should return 500 when service throws', async () => {
      mockGetAll.mockRejectedValue(new Error('DB error'));
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });

  describe('GET /api/shareholders/:name/emitens', () => {
    it('should return 200 with emitens for a shareholder', async () => {
      const mockResult = {
        data: [{ symbol: 'BBCA', emitenName: 'Bank Central Asia', percentage: 47.15 }],
        completeness: { processedEmitens: 850, totalEmitens: 900 },
      };
      mockGetEmitens.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/FarIndo/emitens');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(mockGetEmitens).toHaveBeenCalledWith(fakePool, 'FarIndo');
    });

    it('should decode URI-encoded shareholder name', async () => {
      const mockResult = {
        data: [],
        completeness: { processedEmitens: 850, totalEmitens: 900 },
      };
      mockGetEmitens.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/Pemerintah%20RI/emitens');

      expect(res.status).toBe(200);
      expect(mockGetEmitens).toHaveBeenCalledWith(fakePool, 'Pemerintah RI');
    });

    it('should return 500 when service throws', async () => {
      mockGetEmitens.mockRejectedValue(new Error('DB error'));
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/Test/emitens');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });

  describe('GET /api/emitens/:symbol/shareholders', () => {
    it('should return 200 with shareholders for an emiten', async () => {
      const mockResult = {
        data: [{ shareholderName: 'FarIndo Investments', percentage: 47.15 }],
        completeness: { processedEmitens: 850, totalEmitens: 900 },
      };
      mockGetShareholders.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/emitens/BBCA/shareholders');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(mockGetShareholders).toHaveBeenCalledWith(fakePool, 'BBCA');
    });

    it('should return 500 when service throws', async () => {
      mockGetShareholders.mockRejectedValue(new Error('DB error'));
      server = createApp();

      const res = await request(server, 'GET', '/api/emitens/BBCA/shareholders');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });
});
