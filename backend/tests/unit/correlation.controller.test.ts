import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createCorrelationRouter } from '../../src/controllers/correlation.controller.js';
import type pg from 'pg';

vi.mock('../../src/services/correlation.service.js', () => ({
  getCorrelations: vi.fn(),
  getCommonEmitens: vi.fn(),
}));

import * as correlationService from '../../src/services/correlation.service.js';

const mockGetCorrelations = vi.mocked(correlationService.getCorrelations);
const mockGetCommonEmitens = vi.mocked(correlationService.getCommonEmitens);

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

describe('Correlation Controller', () => {
  let server: http.Server;

  afterEach(() => {
    if (server) server.close();
    vi.clearAllMocks();
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/shareholders', createCorrelationRouter(fakePool));
    return app.listen(0);
  }

  describe('GET /api/shareholders/:name/correlations', () => {
    it('should return 200 with correlations', async () => {
      const mockResult = {
        data: [
          { shareholderName: 'Anthony Salim', correlationScore: 3, commonEmitens: ['BBCA', 'INDF', 'ICBP'] },
        ],
      };
      mockGetCorrelations.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/FarIndo/correlations');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(mockGetCorrelations).toHaveBeenCalledWith(fakePool, 'FarIndo');
    });

    it('should decode URI-encoded shareholder name', async () => {
      const mockResult = { data: [] };
      mockGetCorrelations.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/Pemerintah%20RI/correlations');

      expect(res.status).toBe(200);
      expect(mockGetCorrelations).toHaveBeenCalledWith(fakePool, 'Pemerintah RI');
    });

    it('should include warning when data is incomplete', async () => {
      const mockResult = {
        data: [{ shareholderName: 'Test', correlationScore: 1, commonEmitens: ['BBCA'] }],
        warning: 'Data belum lengkap: 500 dari 900 emiten berhasil diproses. Hasil analisis mungkin tidak lengkap.',
      };
      mockGetCorrelations.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/Test/correlations');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
    });

    it('should return 500 when service throws', async () => {
      mockGetCorrelations.mockRejectedValue(new Error('DB error'));
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/Test/correlations');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });

  describe('GET /api/shareholders/:name1/correlations/:name2', () => {
    it('should return 200 with common emitens', async () => {
      const mockResult = {
        data: [
          { symbol: 'BBCA', emitenName: 'Bank Central Asia', percentage: 47.15 },
        ],
      };
      mockGetCommonEmitens.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/FarIndo/correlations/Anthony%20Salim');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(mockGetCommonEmitens).toHaveBeenCalledWith(fakePool, 'FarIndo', 'Anthony Salim');
    });

    it('should decode both URI-encoded names', async () => {
      const mockResult = { data: [] };
      mockGetCommonEmitens.mockResolvedValue(mockResult);
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/Pemerintah%20RI/correlations/Anthony%20Salim');

      expect(res.status).toBe(200);
      expect(mockGetCommonEmitens).toHaveBeenCalledWith(fakePool, 'Pemerintah RI', 'Anthony Salim');
    });

    it('should return 500 when service throws', async () => {
      mockGetCommonEmitens.mockRejectedValue(new Error('DB error'));
      server = createApp();

      const res = await request(server, 'GET', '/api/shareholders/A/correlations/B');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });
});
