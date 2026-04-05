import pg from 'pg';
import { CorrelationResult, ShareholderEmiten } from '../types.js';
import { getProgress } from '../database/emiten.repository.js';

async function getIncompleteWarning(pool: pg.Pool): Promise<string | undefined> {
  const progress = await getProgress(pool);
  if (progress.success < progress.total) {
    return `Data belum lengkap: ${progress.success} dari ${progress.total} emiten berhasil diproses. Hasil analisis mungkin tidak lengkap.`;
  }
  return undefined;
}

export async function getCorrelations(
  pool: pg.Pool,
  shareholderName: string
): Promise<{ data: CorrelationResult[]; warning?: string }> {
  const result = await pool.query(
    `SELECT s2.shareholder_name,
            COUNT(DISTINCT s2.emiten_symbol) AS correlation_score,
            ARRAY_AGG(DISTINCT s2.emiten_symbol ORDER BY s2.emiten_symbol) AS common_emitens
     FROM shareholdings s1
     JOIN shareholdings s2
       ON s1.emiten_symbol = s2.emiten_symbol
      AND s1.shareholder_name != s2.shareholder_name
     WHERE s1.shareholder_name = $1
     GROUP BY s2.shareholder_name
     ORDER BY correlation_score DESC`,
    [shareholderName]
  );

  const data: CorrelationResult[] = result.rows.map((row) => ({
    shareholderName: row.shareholder_name,
    correlationScore: parseInt(row.correlation_score, 10),
    commonEmitens: row.common_emitens,
  }));

  const warning = await getIncompleteWarning(pool);
  return warning ? { data, warning } : { data };
}

export async function getCommonEmitens(
  pool: pg.Pool,
  name1: string,
  name2: string
): Promise<{ data: ShareholderEmiten[]; warning?: string }> {
  const result = await pool.query(
    `SELECT s1.emiten_symbol AS symbol, e.name AS emiten_name, s1.percentage
     FROM shareholdings s1
     JOIN shareholdings s2
       ON s1.emiten_symbol = s2.emiten_symbol
     JOIN emitens e
       ON s1.emiten_symbol = e.symbol
     WHERE s1.shareholder_name = $1
       AND s2.shareholder_name = $2
     ORDER BY s1.percentage DESC`,
    [name1, name2]
  );

  const data: ShareholderEmiten[] = result.rows.map((row) => ({
    symbol: row.symbol,
    emitenName: row.emiten_name,
    percentage: parseFloat(row.percentage),
  }));

  const warning = await getIncompleteWarning(pool);
  return warning ? { data, warning } : { data };
}
