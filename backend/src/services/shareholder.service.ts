import pg from 'pg';
import {
  ShareholderSummary,
  ShareholderEmiten,
  EmitenShareholder,
  CompletenessMetadata,
} from '../types.js';
import * as shareholdingRepo from '../database/shareholding.repository.js';
import * as emitenRepo from '../database/emiten.repository.js';

async function getCompleteness(pool: pg.Pool): Promise<CompletenessMetadata> {
  const progress = await emitenRepo.getProgress(pool);
  return {
    processedEmitens: progress.success,
    totalEmitens: progress.total,
  };
}

export async function getAllShareholders(
  pool: pg.Pool,
  search?: string
): Promise<{ data: ShareholderSummary[]; completeness: CompletenessMetadata }> {
  const [data, completeness] = await Promise.all([
    shareholdingRepo.getAllShareholders(pool, search),
    getCompleteness(pool),
  ]);
  return { data, completeness };
}

export async function getEmitensByShareholder(
  pool: pg.Pool,
  name: string
): Promise<{ data: ShareholderEmiten[]; completeness: CompletenessMetadata }> {
  const [rows, completeness] = await Promise.all([
    shareholdingRepo.getByShareholder(pool, name),
    getCompleteness(pool),
  ]);
  const data: ShareholderEmiten[] = rows.map((row) => ({
    symbol: row.symbol,
    emitenName: row.emiten_name,
    percentage: row.percentage,
  }));
  return { data, completeness };
}

export async function getShareholdersByEmiten(
  pool: pg.Pool,
  symbol: string
): Promise<{ data: EmitenShareholder[]; completeness: CompletenessMetadata }> {
  const [rows, completeness] = await Promise.all([
    shareholdingRepo.getByEmiten(pool, symbol),
    getCompleteness(pool),
  ]);
  const data: EmitenShareholder[] = rows.map((row) => ({
    shareholderName: row.shareholder_name,
    percentage: row.percentage,
  }));
  return { data, completeness };
}
