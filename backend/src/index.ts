import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { config } from './config.js';
import { getPool, closePool } from './database/connection.js';
import { runMigrations } from './database/migrations.js';
import { FloodController } from './core/flood-controller.js';
import { Fetcher } from './core/fetcher.js';
import { createStatusRouter } from './controllers/status.controller.js';
import { createFetchRouter } from './controllers/fetch.controller.js';
import { createFloodConfigRouter } from './controllers/flood-config.controller.js';
import { createShareholderRouter, createEmitenRouter } from './controllers/shareholder.controller.js';
import { createCorrelationRouter } from './controllers/correlation.controller.js';
import { createGraphRouter } from './controllers/graph.controller.js';
import { createIntelligenceRouter } from './controllers/intelligence.controller.js';
import { createFreeFloatRouter } from './controllers/freefloat.controller.js';
import { FreeFloatFetcher } from './core/freefloat-fetcher.js';
import { runFreeFloatMigration } from './database/migrations.js';

async function main(): Promise<void> {
  const app = express();

  // Middleware
  app.use(express.json());

  // Simple CORS middleware (allow all origins for testing)
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Initialize database
  const pool = getPool();
  await runMigrations(pool);
  await runFreeFloatMigration(pool);

  // Initialize core modules
  const floodController = new FloodController();
  const fetcher = new Fetcher(pool, floodController, config.datasahamApiKey);
  const freeFloatFetcher = new FreeFloatFetcher(pool, new FloodController({ delayMs: 1500 }), config.datasahamApiKey);

  // Register routes
  app.use('/api', createStatusRouter(pool, fetcher, floodController));
  app.use('/api/fetch', createFetchRouter(fetcher));
  app.use('/api/flood-control', createFloodConfigRouter(floodController));
  app.use('/api/shareholders', createShareholderRouter(pool));
  app.use('/api/shareholders', createCorrelationRouter(pool));
  app.use('/api/emitens', createEmitenRouter(pool));
  app.use('/api/graph', createGraphRouter(pool));
  app.use('/api/intelligence', createIntelligenceRouter(pool));
  app.use('/api/freefloat', createFreeFloatRouter(pool, freeFloatFetcher));

  // Start server
  const server = app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    server.close(() => {
      console.log('HTTP server closed');
    });
    await closePool();
    console.log('Database pool closed');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
