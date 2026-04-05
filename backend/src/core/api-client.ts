import type {
  EmitenListResponse,
  EmitenProfileResponse,
  RawSectorsResponse,
  RawSubsectorsResponse,
  RawCompaniesResponse,
  RawProfileResponse,
} from '../types.js';

// --- Custom Error Classes ---

export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export class ApiAuthError extends Error {
  constructor(message = 'Autentikasi gagal. Periksa konfigurasi API key.') {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export class ApiRateLimitError extends Error {
  constructor(message = 'Rate limited (429). Terlalu banyak request.') {
    super(message);
    this.name = 'ApiRateLimitError';
  }
}

// --- Constants ---

const REQUEST_TIMEOUT_MS = 30_000;

// IDX stock sector IDs (exclude non-stock sectors like Currencies, Commodities, etc.)
const IDX_SECTOR_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '50', '51'];

// --- API Client Functions ---

/**
 * Fetch all emitens by iterating sectors → subsectors → companies.
 * Only includes active stocks (type_company = "Saham", company_status = "STATUS_ACTIVE").
 */
export async function fetchEmitenList(
  apiKey: string,
  baseUrl: string,
): Promise<EmitenListResponse> {
  const allEmitens: Array<{ symbol: string; name: string }> = [];
  const seen = new Set<string>();

  // Step 1: Get sectors
  const sectorsBody = await apiGet<RawSectorsResponse>(apiKey, baseUrl, '/api/sectors/');
  const sectors = sectorsBody?.data?.data ?? [];

  // Step 2: For each IDX sector, get subsectors
  for (const sector of sectors) {
    if (!IDX_SECTOR_IDS.includes(sector.id)) continue;

    const subsBody = await apiGet<RawSubsectorsResponse>(
      apiKey, baseUrl, `/api/sectors/${sector.id}/subsectors`,
    );
    const subsectors = subsBody?.data?.data ?? [];

    // Step 3: For each subsector, get companies
    for (const sub of subsectors) {
      const compBody = await apiGet<RawCompaniesResponse>(
        apiKey, baseUrl, `/api/sectors/${sector.id}/subsectors/${sub.id}/companies`,
      );
      const companies = compBody?.data?.data ?? [];

      for (const c of companies) {
        if (c.company_status === 'STATUS_ACTIVE' && c.type_company === 'Saham' && !seen.has(c.symbol)) {
          seen.add(c.symbol);
          allEmitens.push({ symbol: c.symbol, name: c.name });
        }
      }
    }
  }

  return { data: allEmitens };
}

/**
 * Fetch emiten profile and extract shareholders.
 * Uses shareholder_one_percent (already ≥1%) if available, otherwise falls back to shareholder array.
 * Percentage strings like "54.942%" are parsed to numbers.
 */
export async function fetchEmitenProfile(
  apiKey: string,
  baseUrl: string,
  symbol: string,
): Promise<EmitenProfileResponse> {
  const body = await apiGet<RawProfileResponse>(
    apiKey, baseUrl, `/api/emiten/${encodeURIComponent(symbol)}/profile`,
  );

  if (!body || !body.data) {
    throw new ApiError(0, `Invalid profile response for ${symbol}: missing data`);
  }

  const shareholders: Array<{ name: string; percentage: number }> = [];

  // Prefer shareholder_one_percent (already filtered ≥1%)
  const onePercent = body.data.shareholder_one_percent?.shareholder;
  if (onePercent && onePercent.length > 0) {
    for (const sh of onePercent) {
      const pct = parsePercentage(sh.percentage);
      if (pct >= 1.0) {
        shareholders.push({ name: sh.name, percentage: pct });
      }
    }
  } else if (body.data.shareholder) {
    // Fallback to main shareholder array
    for (const sh of body.data.shareholder) {
      const pct = parsePercentage(sh.percentage);
      if (pct >= 1.0) {
        shareholders.push({ name: sh.name, percentage: pct });
      }
    }
  }

  return { symbol, name: symbol, shareholders };
}

// --- Helpers ---

/** Parse percentage string like "54.942%" or "<0.0001%" to number */
function parsePercentage(pctStr: string): number {
  if (!pctStr) return 0;
  const cleaned = pctStr.replace('%', '').replace('<', '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/** Generic GET request with error handling */
async function apiGet<T>(apiKey: string, baseUrl: string, path: string): Promise<T> {
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': apiKey },
      signal: controller.signal,
    });

    if (!response.ok) {
      handleHttpError(response.status, `GET ${url}`);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiAuthError || error instanceof ApiRateLimitError || error instanceof ApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, `Request timeout after ${REQUEST_TIMEOUT_MS}ms: GET ${url}`);
    }
    throw new ApiError(0, `Network error: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Helpers ---

function handleHttpError(status: number, context: string): never {
  if (status === 401) {
    throw new ApiAuthError();
  }
  if (status === 429) {
    throw new ApiRateLimitError();
  }
  throw new ApiError(status, `HTTP ${status} error on ${context}`);
}
