import { Router, Request, Response } from 'express';
import pg from 'pg';
import * as intelligenceService from '../services/intelligence.service.js';

export function createIntelligenceRouter(pool: pg.Pool): Router {
  const router = Router();

  // Search graph nodes
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

  // Shareholder leaderboard
  router.get('/leaderboard', async (req: Request, res: Response) => {
    try {
      const sortBy = req.query.sort_by === 'total_percentage' ? 'total_percentage' : 'emiten_count';
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
      const result = await intelligenceService.getLeaderboard(pool, sortBy, limit);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/intelligence/leaderboard:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Co-ownership clusters
  router.get('/clusters', async (req: Request, res: Response) => {
    try {
      const minShared = typeof req.query.min_shared === 'string' ? parseInt(req.query.min_shared, 10) : 3;
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;
      const result = await intelligenceService.getClusters(pool, minShared, limit);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/intelligence/clusters:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Concentration score for one emiten
  router.get('/concentration/:symbol', async (req: Request, res: Response) => {
    try {
      const result = await intelligenceService.getConcentration(pool, req.params.symbol);
      if (!result) {
        res.status(404).json({ message: 'Emiten not found' });
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/intelligence/concentration/:symbol:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // All concentration scores
  router.get('/concentrations', async (req: Request, res: Response) => {
    try {
      const sortBy = req.query.sort_by === 'shareholder_count' ? 'shareholder_count' : 'score';
      const order = req.query.order === 'asc' ? 'asc' : 'desc';
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
      const result = await intelligenceService.getAllConcentrations(pool, sortBy, order, limit);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/intelligence/concentrations:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
