import { Router, Request, Response } from 'express';
import pg from 'pg';
import * as correlationService from '../services/correlation.service.js';

export function createCorrelationRouter(pool: pg.Pool): Router {
  const router = Router();

  router.get('/:name/correlations', async (req: Request, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const result = await correlationService.getCorrelations(pool, name);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/shareholders/:name/correlations:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.get('/:name1/correlations/:name2', async (req: Request, res: Response) => {
    try {
      const name1 = decodeURIComponent(req.params.name1);
      const name2 = decodeURIComponent(req.params.name2);
      const result = await correlationService.getCommonEmitens(pool, name1, name2);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error in GET /api/shareholders/:name1/correlations/:name2:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
