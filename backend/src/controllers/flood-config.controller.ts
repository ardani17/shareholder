import { Router, Request, Response } from 'express';
import { FloodController } from '../core/flood-controller.js';

export function createFloodConfigRouter(floodController: FloodController): Router {
  const router = Router();

  router.get('/config', (_req: Request, res: Response) => {
    try {
      const config = floodController.getConfig();
      res.status(200).json(config);
    } catch (err) {
      console.error('Error in GET /api/flood-control/config:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.put('/config', (req: Request, res: Response) => {
    try {
      const body = req.body;
      const validFields = ['delayMs', 'maxConcurrency', 'maxRetries', 'initialBackoffMs'];
      const hasValidField = validFields.some((field) => body && body[field] !== undefined);

      if (!hasValidField) {
        res.status(400).json({ message: 'Request body must contain at least one valid config field: delayMs, maxConcurrency, maxRetries, initialBackoffMs' });
        return;
      }

      floodController.updateConfig(body);
      const updatedConfig = floodController.getConfig();
      res.status(200).json(updatedConfig);
    } catch (err) {
      console.error('Error in PUT /api/flood-control/config:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
