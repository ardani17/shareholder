import pg from 'pg';

export async function saveShareholdings(
  pool: pg.Pool,
  emitenSymbol: string,
  shareholders: Array<{ name: string; percentage: number }>
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM shareholdings WHERE emiten_symbol = $1', [emitenSymbol]);

    for (const sh of shareholders) {
      await client.query(
        'INSERT INTO shareholdings (emiten_symbol, shareholder_name, percentage, fetched_at) VALUES ($1, $2, $3, NOW())',
        [emitenSymbol, sh.name, sh.percentage]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getByEmiten(
  pool: pg.Pool,
  emitenSymbol: string
): Promise<Array<{ shareholder_name: string; percentage: number }>> {
  const result = await pool.query(
    'SELECT shareholder_name, percentage FROM shareholdings WHERE emiten_symbol = $1 ORDER BY percentage DESC',
    [emitenSymbol]
  );
  return result.rows.map(row => ({
    shareholder_name: row.shareholder_name,
    percentage: parseFloat(row.percentage),
  }));
}

export async function getByShareholder(
  pool: pg.Pool,
  shareholderName: string
): Promise<Array<{ symbol: string; emiten_name: string; percentage: number }>> {
  const result = await pool.query(
    `SELECT s.emiten_symbol AS symbol, e.name AS emiten_name, s.percentage
     FROM shareholdings s
     JOIN emitens e ON s.emiten_symbol = e.symbol
     WHERE s.shareholder_name = $1
     ORDER BY s.percentage DESC`,
    [shareholderName]
  );
  return result.rows.map(row => ({
    symbol: row.symbol,
    emiten_name: row.emiten_name,
    percentage: parseFloat(row.percentage),
  }));
}

export async function getAllShareholders(
  pool: pg.Pool,
  search?: string
): Promise<Array<{ name: string; emitenCount: number }>> {
  let query = `
    SELECT shareholder_name AS name, COUNT(DISTINCT emiten_symbol) AS emiten_count
    FROM shareholdings
  `;
  const params: unknown[] = [];

  if (search) {
    query += ' WHERE shareholder_name ILIKE $1';
    params.push(`%${search}%`);
  }

  query += ' GROUP BY shareholder_name ORDER BY emiten_count DESC';

  const result = await pool.query(query, params);
  return result.rows.map(row => ({
    name: row.name,
    emitenCount: parseInt(row.emiten_count, 10),
  }));
}

export async function deleteByEmiten(
  pool: pg.Pool,
  emitenSymbol: string
): Promise<void> {
  await pool.query('DELETE FROM shareholdings WHERE emiten_symbol = $1', [emitenSymbol]);
}

export async function searchShareholders(
  pool: pg.Pool,
  search: string
): Promise<string[]> {
  const result = await pool.query(
    'SELECT DISTINCT shareholder_name FROM shareholdings WHERE shareholder_name ILIKE $1 ORDER BY shareholder_name',
    [`%${search}%`]
  );
  return result.rows.map(row => row.shareholder_name);
}

export async function searchEmitens(
  pool: pg.Pool,
  search: string
): Promise<Array<{ symbol: string; name: string }>> {
  const result = await pool.query(
    'SELECT symbol, name FROM emitens WHERE symbol ILIKE $1 OR name ILIKE $1 ORDER BY symbol',
    [`%${search}%`]
  );
  return result.rows.map(row => ({
    symbol: row.symbol,
    name: row.name,
  }));
}
