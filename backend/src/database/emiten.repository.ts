import pg from 'pg';

export interface EmitenRow {
  symbol: string;
  name: string;
  status: string;
  fetched_at: string | null;
  error_message: string | null;
}

export interface EmitenProgress {
  success: number;
  failed: number;
  pending: number;
  total: number;
}

export async function insertEmitens(
  pool: pg.Pool,
  emitens: Array<{ symbol: string; name: string }>
): Promise<void> {
  if (emitens.length === 0) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < emitens.length; i++) {
    const offset = i * 2;
    placeholders.push(`($${offset + 1}, $${offset + 2}, 'pending')`);
    values.push(emitens[i].symbol, emitens[i].name);
  }

  await pool.query(
    `INSERT INTO emitens (symbol, name, status) VALUES ${placeholders.join(', ')} ON CONFLICT (symbol) DO NOTHING`,
    values
  );
}

export async function getAll(pool: pg.Pool): Promise<EmitenRow[]> {
  const result = await pool.query('SELECT symbol, name, status, fetched_at, error_message FROM emitens');
  return result.rows;
}

export async function getByStatus(pool: pg.Pool, status: string): Promise<EmitenRow[]> {
  const result = await pool.query(
    'SELECT symbol, name, status, fetched_at, error_message FROM emitens WHERE status = $1',
    [status]
  );
  return result.rows;
}

export async function updateStatus(
  pool: pg.Pool,
  symbol: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  if (status === 'success' || status === 'failed') {
    await pool.query(
      'UPDATE emitens SET status = $1, fetched_at = NOW(), error_message = $2 WHERE symbol = $3',
      [status, errorMessage ?? null, symbol]
    );
  } else {
    await pool.query(
      'UPDATE emitens SET status = $1, error_message = $2 WHERE symbol = $3',
      [status, errorMessage ?? null, symbol]
    );
  }
}

export async function getProgress(pool: pg.Pool): Promise<EmitenProgress> {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS success,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
      COUNT(*) AS total
    FROM emitens
  `);

  const row = result.rows[0];
  return {
    success: parseInt(row.success, 10),
    failed: parseInt(row.failed, 10),
    pending: parseInt(row.pending, 10),
    total: parseInt(row.total, 10),
  };
}

export async function resetStatus(pool: pg.Pool, symbol: string): Promise<void> {
  await pool.query(
    'UPDATE emitens SET status = $1, fetched_at = NULL, error_message = NULL WHERE symbol = $2',
    ['pending', symbol]
  );
}

export async function getLastUpdated(pool: pg.Pool): Promise<string | null> {
  const result = await pool.query(
    "SELECT MAX(fetched_at) as last_fetch FROM emitens WHERE status = 'success'"
  );
  return result.rows[0]?.last_fetch ?? null;
}
