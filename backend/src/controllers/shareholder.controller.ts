import { Router, Request, Response } from 'express';
import pg from 'pg';
import * as shareholderService from '../services/shareholder.service.js';

export function createShareholderRouter(pool: pg.Pool): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const result = await shareholderService.getAllShareholders(pool, search);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/shareholders:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.get('/:name/emitens', async (req: Request, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const result = await shareholderService.getEmitensByShareholder(pool, name);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/shareholders/:name/emitens:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}

export function createEmitenRouter(pool: pg.Pool): Router {
  const router = Router();

  router.get('/:symbol/shareholders', async (req: Request, res: Response) => {
    try {
      const result = await shareholderService.getShareholdersByEmiten(pool, req.params.symbol);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/emitens/:symbol/shareholders:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
