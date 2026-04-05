import pg from 'pg';
import { getByStatus } from '../database/emiten.repository.js';
import { upsertFreeFloat, getFreeFloatProgress } from '../database/freefloat.repository.js';
import { fetchEmitenKeystats, fetchEmitenProfile, ApiAuthError } from './api-client.js';
import { FloodController } from './flood-controller.js';

/** Parse "123.28 B" or "414.689.200" to number */
function parseShareCount(val: string | null): number | null {
  if (!val) return null;
  const cleaned = val.replace(/,/g, '').trim();
  const match = cleaned.match(/^([\d.]+)\s*([KMBT]?)$/i);
  if (!match) {
    // Try parsing dot-separated Indonesian format: "414.689.200"
    const dotNum = cleaned.replace(/\./g, '');
    const n = parseInt(dotNum, 10);
    return isNaN(n) ? null : n;
  }
  let num = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  if (suffix === 'K') num *= 1_000;
  else if (suffix === 'M') num *= 1_000_000;
  else if (suffix === 'B') num *= 1_000_000_000;
  else if (suffix === 'T') num *= 1_000_000_000_000;
  return Math.round(num);
}

function parsePercentage(val: string | null): number | null {
  if (!val) return null;
  const num = parseFloat(val.replace('%', '').trim());
  return isNaN(num) ? null : num;
}

function parseShareholderCount(val: string | null): number | null {
  if (!val) return null;
  const num = parseInt(val.replace(/[,.\s]/g, ''), 10);
  return isNaN(num) ? null : num;
}

function calcCompliance(freeFloatPct: number | null, freeFloatShares: number | null, shareholderCount: number | null): string {
  if (freeFloatPct == null || shareholderCount == null) return 'unknown';
  const ffOk = freeFloatPct >= 7.5;
  const sharesOk = freeFloatShares == null || freeFloatShares >= 50_000_000;
  const holdersOk = shareholderCount >= 300;
  if (ffOk && sharesOk && holdersOk) return 'memenuhi';
  return 'tidak_memenuhi';
}

export class FreeFloatFetcher {
  private _pool: pg.Pool;
  private _fc: FloodController;
  private _apiKey: string;
  private _baseUrl: string;
  private _isRunning = false;

  constructor(pool: pg.Pool, fc: FloodController, apiKey: string, baseUrl = 'https://api.cloudnexify.com') {
    this._pool = pool;
    this._fc = fc;
    this._apiKey = apiKey;
    this._baseUrl = baseUrl;
  }

  async start(): Promise<void> {
    if (this._isRunning) return;
    this._isRunning = true;
    try {
      const emitens = await getByStatus(this._pool, 'success');
      console.log(`[FreeFloat] Processing ${emitens.length} emitens...`);
      let done = 0;

      for (const emiten of emitens) {
        if (this._fc.isPaused()) break;
        try {
          await this._fc.execute(async () => {
            // Fetch keystats
            const ks = await fetchEmitenKeystats(this._apiKey, this._baseUrl, emiten.symbol);
            // Fetch profile for shareholder_numbers + board
            const profileBody = await fetchProfileRaw(this._apiKey, this._baseUrl, emiten.symbol);

            const freeFloatPct = parsePercentage(ks.freeFloat);
            const shareOutstanding = parseShareCount(ks.shareOutstanding);
            const freeFloatShares = (freeFloatPct != null && shareOutstanding != null)
              ? Math.round((freeFloatPct / 100) * shareOutstanding)
              : null;

            const shNumbers = profileBody?.data?.shareholder_numbers;
            const latestSh = Array.isArray(shNumbers) && shNumbers.length > 0 ? shNumbers[0] : null;
            const shareholderCount = parseShareholderCount(latestSh?.total_share ?? null);
            const shareholderDate = latestSh?.shareholder_date ?? null;
            const board = profileBody?.data?.history?.board ?? null;

            const complianceStatus = calcCompliance(freeFloatPct, freeFloatShares, shareholderCount);

            await upsertFreeFloat(this._pool, {
              symbol: emiten.symbol,
              freeFloatPct,
              shareOutstanding,
              freeFloatShares,
              shareholderCount,
              shareholderDate,
              board,
              complianceStatus,
            });

            done++;
            if (done % 50 === 0) console.log(`[FreeFloat] ${done}/${emitens.length} done`);
          });
        } catch (err) {
          if (err instanceof ApiAuthError) {
            console.error('[FreeFloat] Auth error, stopping.');
            break;
          }
          console.error(`[FreeFloat] Error for ${emiten.symbol}:`, (err as Error).message);
        }
      }
      console.log(`[FreeFloat] Complete. ${done} emitens processed.`);
    } finally {
      this._isRunning = false;
    }
  }

  get isRunning() { return this._isRunning; }

  async getProgress() {
    return getFreeFloatProgress(this._pool);
  }
}

/** Raw profile fetch (reuse apiGet pattern but return raw body) */
async function fetchProfileRaw(apiKey: string, baseUrl: string, symbol: string): Promise<any> {
  const url = `${baseUrl}/api/emiten/${encodeURIComponent(symbol)}/profile`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  return res.json();
}
