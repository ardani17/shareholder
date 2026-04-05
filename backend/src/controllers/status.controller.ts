import { Router, Request, Response } from 'express';
import pg from 'pg';
import { Fetcher } from '../core/fetcher.js';
import { FloodController } from '../core/flood-controller.js';
import { getLastUpdated } from '../database/emiten.repository.js';

export function createStatusRouter(pool: pg.Pool, fetcher: Fetcher, floodController: FloodController): Router {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      let database: 'connected' | 'disconnected' = 'disconnected';
      try {
        await pool.query('SELECT 1');
        database = 'connected';
      } catch {
        database = 'disconnected';
      }

      const fetch = await fetcher.getProgress();
      const floodControl = {
        ...floodController.getConfig(),
        ...floodController.getStats(),
      };
      const lastUpdated = await getLastUpdated(pool).catch(() => null);

      res.status(200).json({ database, fetch, floodControl, lastUpdated });
    } catch (err) {
      console.error('Error in GET /api/status:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
