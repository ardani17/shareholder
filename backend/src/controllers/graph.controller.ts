import { Router, Request, Response } from 'express';
import pg from 'pg';
import * as graphService from '../services/graph.service.js';
import * as intelligenceService from '../services/intelligence.service.js';

export function createGraphRouter(pool: pg.Pool): Router {
  const router = Router();

  // Search nodes by name
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      if (!q.trim()) {
        res.status(400).json({ message: 'Query parameter "q" is required' });
        return;
      }
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;
      const result = await intelligenceService.searchNodes(pool, q, limit);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/graph/search:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Find path between two nodes
  router.get('/path', async (req: Request, res: Response) => {
    try {
      const from = typeof req.query.from === 'string' ? req.query.from : '';
      const to = typeof req.query.to === 'string' ? req.query.to : '';
      if (!from || !to) {
        res.status(400).json({ message: 'Query parameters "from" and "to" are required' });
        return;
      }
      const result = await intelligenceService.findPath(pool, from, to);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/graph/path:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.get('/nodes', async (req: Request, res: Response) => {
    try {
      const minEmitens = typeof req.query.min_emitens === 'string'
        ? parseInt(req.query.min_emitens, 10)
        : undefined;
      const result = await graphService.getNodes(pool, minEmitens);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/graph/nodes:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.get('/edges', async (req: Request, res: Response) => {
    try {
      const minEmitens = typeof req.query.min_emitens === 'string'
        ? parseInt(req.query.min_emitens, 10)
        : undefined;
      const result = await graphService.getEdges(pool, minEmitens);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/graph/edges:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.get('/subgraph/:nodeId', async (req: Request, res: Response) => {
    try {
      const result = await graphService.getSubgraph(pool, decodeURIComponent(req.params.nodeId));
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/graph/subgraph/:nodeId:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
