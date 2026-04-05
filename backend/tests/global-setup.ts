import pg from 'pg';
import { runMigrations } from '../src/database/migrations.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/shareholder_mapping_test';

export async function setup() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  await runMigrations(pool);
  await pool.end();
}
