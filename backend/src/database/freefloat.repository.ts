import pg from 'pg';

export interface FreeFloatRow {
  symbol: string;
  free_float_pct: number | null;
  share_outstanding: number | null;
  free_float_shares: number | null;
  shareholder_count: number | null;
  shareholder_date: string | null;
  board: string | null;
  compliance_status: string;
  fetched_at: string;
}

export async function upsertFreeFloat(
  pool: pg.Pool,
  data: {
    symbol: string;
    freeFloatPct: number | null;
    shareOutstanding: number | null;
    freeFloatShares: number | null;
    shareholderCount: number | null;
    shareholderDate: string | null;
    board: string | null;
    complianceStatus: string;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO free_float_data (symbol, free_float_pct, share_outstanding, free_float_shares, shareholder_count, shareholder_date, board, compliance_status, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (symbol) DO UPDATE SET
       free_float_pct = $2, share_outstanding = $3, free_float_shares = $4,
       shareholder_count = $5, shareholder_date = $6, board = $7,
       compliance_status = $8, fetched_at = NOW()`,
    [data.symbol, data.freeFloatPct, data.shareOutstanding, data.freeFloatShares,
     data.shareholderCount, data.shareholderDate, data.board, data.complianceStatus]
  );
}

export async function getAllFreeFloat(
  pool: pg.Pool,
  filter?: { status?: string; search?: string; sortBy?: string; order?: string }
): Promise<FreeFloatRow[]> {
  let query = `SELECT f.*, e.name as emiten_name FROM free_float_data f JOIN emitens e ON f.symbol = e.symbol WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;

  if (filter?.status) {
    query += ` AND f.compliance_status = $${idx++}`;
    params.push(filter.status);
  }
  if (filter?.search) {
    query += ` AND (f.symbol ILIKE $${idx} OR e.name ILIKE $${idx})`;
    params.push(`%${filter.search}%`);
    idx++;
  }

  const sortCol = filter?.sortBy === 'free_float_pct' ? 'f.free_float_pct'
    : filter?.sortBy === 'shareholder_count' ? 'f.shareholder_count'
    : filter?.sortBy === 'free_float_shares' ? 'f.free_float_shares'
    : 'f.symbol';
  const order = filter?.order === 'desc' ? 'DESC' : 'ASC';
  query += ` ORDER BY ${sortCol} ${order} NULLS LAST`;

  const result = await pool.query(query, params);
  return result.rows.map(r => ({
    ...r,
    free_float_pct: r.free_float_pct ? parseFloat(r.free_float_pct) : null,
    share_outstanding: r.share_outstanding ? parseInt(r.share_outstanding, 10) : null,
    free_float_shares: r.free_float_shares ? parseInt(r.free_float_shares, 10) : null,
    shareholder_count: r.shareholder_count ? parseInt(r.shareholder_count, 10) : null,
  }));
}

export async function getFreeFloatProgress(pool: pg.Pool): Promise<{ fetched: number; total: number }> {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM free_float_data) as fetched,
      (SELECT COUNT(*) FROM emitens WHERE status = 'success') as total
  `);
  return {
    fetched: parseInt(result.rows[0].fetched, 10),
    total: parseInt(result.rows[0].total, 10),
  };
}
