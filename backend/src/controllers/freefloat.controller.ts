import { Router, Request, Response } from 'express';
import pg from 'pg';
import { getAllFreeFloat } from '../database/freefloat.repository.js';
import { FreeFloatFetcher } from '../core/freefloat-fetcher.js';

export function createFreeFloatRouter(pool: pg.Pool, fetcher: FreeFloatFetcher): Router {
  const router = Router();

  router.post('/fetch', (_req: Request, res: Response) => {
    if (fetcher.isRunning) {
      res.status(409).json({ message: 'Free float fetch already running' });
      return;
    }
    fetcher.start().catch(err => console.error('[FreeFloat] Fetch error:', err));
    res.status(200).json({ message: 'Free float fetch started' });
  });

  router.get('/progress', async (_req: Request, res: Response) => {
    try {
      const progress = await fetcher.getProgress();
      res.status(200).json({ ...progress, isRunning: fetcher.isRunning });
    } catch (err) {
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.get('/data', async (req: Request, res: Response) => {
    try {
      const filter = {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        sortBy: typeof req.query.sort_by === 'string' ? req.query.sort_by : undefined,
        order: typeof req.query.order === 'string' ? req.query.order : undefined,
      };
      const data = await getAllFreeFloat(pool, filter);
      res.status(200).json(data);
    } catch (err) {
      console.error('Error in GET /api/freefloat/data:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
