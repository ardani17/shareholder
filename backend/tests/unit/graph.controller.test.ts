import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createGraphRouter } from '../../src/controllers/graph.controller.js';
import type pg from 'pg';

vi.mock('../../src/services/graph.service.js', () => ({
  getNodes: vi.fn(),
  getEdges: vi.fn(),
  getSubgraph: vi.fn(),
}));

import * as graphService from '../../src/services/graph.service.js';

const mockGetNodes = vi.mocked(graphService.getNodes);
const mockGetEdges = vi.mocked(graphService.getEdges);
const mockGetSubgraph = vi.mocked(graphService.getSubgraph);

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

describe('Graph Controller', () => {
  let server: http.Server;

  afterEach(() => {
    if (server) server.close();
    vi.clearAllMocks();
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/graph', createGraphRouter(fakePool));
    return app.listen(0);
  }

  describe('GET /api/graph/nodes', () => {
    it('should return 200 with nodes', async () => {
      const mockNodes = [
        { id: 'emiten:BBCA', type: 'emiten' as const, label: 'BBCA', size: 3 },
        { id: 'shareholder:Pemerintah RI', type: 'shareholder' as const, label: 'Pemerintah RI', size: 15 },
      ];
      mockGetNodes.mockResolvedValue(mockNodes);
      server = createApp();

      const res = await request(server, 'GET', '/api/graph/nodes');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockNodes);
      expect(mockGetNodes).toHaveBeenCalledWith(fakePool, undefined);
    });

    it('should parse min_emitens query param as integer', async () => {
      mockGetNodes.mockResolvedValue([]);
      server = createApp();

      const res = await request(server, 'GET', '/api/graph/nodes?min_emitens=5');

      expect(res.status).toBe(200);
      expect(mockGetNodes).toHaveBeenCalledWith(fakePool, 5);
    });

    it('should return 500 when service throws', async () => {
      mockGetNodes.mockRejectedValue(new Error('DB error'));
      server = createApp();

      const res = await request(server, 'GET', '/api/graph/nodes');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });

  describe('GET /api/graph/edges', () => {
    it('should return 200 with edges', async () => {
      const mockEdges = [
        { source: 'shareholder:Pemerintah RI', target: 'emiten:TLKM', percentage: 52.09 },
      ];
      mockGetEdges.mockResolvedValue(mockEdges);
      server = createApp();

      const res = await request(server, 'GET', '/api/graph/edges');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockEdges);
      expect(mockGetEdges).toHaveBeenCalledWith(fakePool, undefined);
    });

    it('should parse min_emitens query param as integer', async () => {
      mockGetEdges.mockResolvedValue([]);
      server = createApp();

      const res = await request(server, 'GET', '/api/graph/edges?min_emitens=3');

      expect(res.status).toBe(200);
      expect(mockGetEdges).toHaveBeenCalledWith(fakePool, 3);
    });

    it('should return 500 when service throws', async () => {
      mockGetEdges.mockRejectedValue(new Error('DB error'));
      server = createApp();

      const res = await request(server, 'GET', '/api/graph/edges');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });

  describe('GET /api/graph/subgraph/:nodeId', () => {
    it('should return 200 with subgraph', async () => {
      const mockSubgraph = {
        nodes: [{ id: 'emiten:BBCA', type: 'emiten' as const, label: 'BBCA', size: 2 }],
        edges: [{ source: 'shareholder:FarIndo', target: 'emiten:BBCA', percentage: 47.15 }],
      };
      mockGetSubgraph.mockResolvedValue(mockSubgraph);
      server = createApp();

      const res = await request(server, 'GET', '/api/graph/subgraph/emiten:BBCA');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockSubgraph);
      expect(mockGetSubgraph).toHaveBeenCalledWith(fakePool, 'emiten:BBCA');
    });

    it('should decode URI-encoded nodeId', async () => {
      const mockSubgraph = { nodes: [], edges: [] };
      mockGetSubgraph.mockResolvedValue(mockSubgraph);
      server = createApp();

      const res = await request(server, 'GET', '/api/graph/subgraph/shareholder%3APemerintah%20RI');

      expect(res.status).toBe(200);
      expect(mockGetSubgraph).toHaveBeenCalledWith(fakePool, 'shareholder:Pemerintah RI');
    });

    it('should return 500 when service throws', async () => {
      mockGetSubgraph.mockRejectedValue(new Error('DB error'));
      server = createApp();

      const res = await request(server, 'GET', '/api/graph/subgraph/emiten:BBCA');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });
});
