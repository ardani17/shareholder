import pg from 'pg';

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS emitens (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('success', 'failed', 'pending')),
      fetched_at TIMESTAMPTZ,
      error_message TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shareholdings (
      id SERIAL PRIMARY KEY,
      emiten_symbol TEXT NOT NULL REFERENCES emitens(symbol) ON DELETE CASCADE,
      shareholder_name TEXT NOT NULL,
      percentage NUMERIC(6,2) NOT NULL CHECK(percentage >= 1.0),
      fetched_at TIMESTAMPTZ NOT NULL
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shareholdings_emiten ON shareholdings(emiten_symbol)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shareholdings_shareholder ON shareholdings(shareholder_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emitens_status ON emitens(status)`);
}
