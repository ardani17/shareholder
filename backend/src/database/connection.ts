import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    // Lazy import to avoid config validation during testing
    const { config } = require('../config.js');
    pool = new Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function createTestPool(connectionString: string): pg.Pool {
  return new Pool({ connectionString });
}
