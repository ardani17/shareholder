import { Router, Request, Response } from 'express';
import { Fetcher } from '../core/fetcher.js';

export function createFetchRouter(fetcher: Fetcher): Router {
  const router = Router();

  router.post('/start', (req: Request, res: Response) => {
    try {
      const force = req.body?.force === true;
      const progress = fetcher.getProgress();
      progress.then((p) => {
        if (p.isRunning) {
          res.status(409).json({ message: 'Batch fetch already running' });
          return;
        }
        fetcher.start(force).catch((err) => {
          console.error('Batch fetch error:', err);
        });
        res.status(200).json({ message: force ? 'Force refresh started' : 'Batch fetch started' });
      }).catch((err) => {
        console.error('Error checking progress:', err);
        res.status(500).json({ message: 'Internal server error' });
      });
    } catch (err) {
      console.error('Error in /start:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.post('/pause', (_req: Request, res: Response) => {
    try {
      fetcher.pause();
      res.status(200).json({ message: 'Batch fetch paused' });
    } catch (err) {
      console.error('Error in /pause:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.post('/resume', (_req: Request, res: Response) => {
    try {
      fetcher.resume();
      res.status(200).json({ message: 'Batch fetch resumed' });
    } catch (err) {
      console.error('Error in /resume:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.get('/progress', async (_req: Request, res: Response) => {
    try {
      const progress = await fetcher.getProgress();
      res.status(200).json(progress);
    } catch (err) {
      console.error('Error in /progress:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
