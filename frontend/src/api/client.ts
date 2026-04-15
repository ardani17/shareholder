async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error(`Tidak bisa terhubung ke backend. Pastikan server berjalan.`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
      else if (body?.message) detail = body.message;
    } catch { /* ignore parse error */ }
    throw new Error(`[${res.status}] ${detail}`);
  }
  return res.json() as Promise<T>;
}

// --- Status & Fetch Control ---

export function getStatus() {
  return request<Record<string, unknown>>('/api/status');
}

export function getProgress() {
  return request<{
    total: number;
    success: number;
    failed: number;
    pending: number;
    isRunning: boolean;
    isPaused: boolean;
  }>('/api/fetch/progress');
}

export function startFetch() {
  return request<Record<string, unknown>>('/api/fetch/start', { method: 'POST' });
}

export function refreshFetch() {
  return request<Record<string, unknown>>('/api/fetch/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: true }),
  });
}

export function pauseFetch() {
  return request<Record<string, unknown>>('/api/fetch/pause', { method: 'POST' });
}

export function resumeFetch() {
  return request<Record<string, unknown>>('/api/fetch/resume', { method: 'POST' });
}

// --- Flood Control Config ---

export function getFloodConfig() {
  return request<{
    delayMs: number;
    maxConcurrency: number;
    maxRetries: number;
    initialBackoffMs: number;
  }>('/api/flood-control/config');
}

export function updateFloodConfig(config: {
  delayMs?: number;
  maxConcurrency?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
}) {
  return request<{
    delayMs: number;
    maxConcurrency: number;
    maxRetries: number;
    initialBackoffMs: number;
  }>('/api/flood-control/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

// --- Shareholders ---

export function getShareholders(search?: string) {
  const url = search
    ? `/api/shareholders?search=${encodeURIComponent(search)}`
    : '/api/shareholders';
  return request<{
    data: Array<{ name: string; emitenCount: number }>;
    completeness: { processedEmitens: number; totalEmitens: number };
  }>(url);
}

export function getEmitensByShareholder(name: string) {
  return request<{
    data: Array<{ symbol: string; emitenName: string; percentage: number }>;
    completeness: { processedEmitens: number; totalEmitens: number };
  }>(`/api/shareholders/${encodeURIComponent(name)}/emitens`);
}

export function getShareholdersByEmiten(symbol: string) {
  return request<{
    data: Array<{ shareholderName: string; percentage: number }>;
    completeness: { processedEmitens: number; totalEmitens: number };
  }>(`/api/emitens/${encodeURIComponent(symbol)}/shareholders`);
}

// --- Correlations ---

export function getCorrelations(name: string) {
  return request<{
    data: Array<{
      shareholderName: string;
      correlationScore: number;
      commonEmitens: string[];
    }>;
    warning?: string;
  }>(`/api/shareholders/${encodeURIComponent(name)}/correlations`);
}

export function getCommonEmitens(name1: string, name2: string) {
  return request<{
    data: Array<{ symbol: string; emitenName: string; percentage: number }>;
    warning?: string;
  }>(
    `/api/shareholders/${encodeURIComponent(name1)}/correlations/${encodeURIComponent(name2)}`
  );
}

// --- Graph ---

export function getGraphNodes(minEmitens?: number) {
  const url =
    minEmitens != null
      ? `/api/graph/nodes?min_emitens=${minEmitens}`
      : '/api/graph/nodes';
  return request<
    Array<{
      id: string;
      type: 'emiten' | 'shareholder';
      label: string;
      size: number;
    }>
  >(url);
}

export function getGraphEdges(minEmitens?: number) {
  const url =
    minEmitens != null
      ? `/api/graph/edges?min_emitens=${minEmitens}`
      : '/api/graph/edges';
  return request<
    Array<{ source: string; target: string; percentage: number }>
  >(url);
}

export function getSubgraph(nodeId: string) {
  return request<{
    nodes: Array<{
      id: string;
      type: 'emiten' | 'shareholder';
      label: string;
      size: number;
    }>;
    edges: Array<{ source: string; target: string; percentage: number }>;
  }>(`/api/graph/subgraph/${encodeURIComponent(nodeId)}`);
}

// --- Intelligence ---

export function searchGraphNodes(q: string, limit?: number) {
  const params = new URLSearchParams({ q });
  if (limit) params.set('limit', String(limit));
  return request<
    Array<{ id: string; type: 'emiten' | 'shareholder'; label: string; size: number }>
  >(`/api/graph/search?${params}`);
}

export function findPath(from: string, to: string) {
  const params = new URLSearchParams({ from, to });
  return request<{
    path: Array<{ from: string; to: string; via: string; percentage: number }>;
    found: boolean;
  }>(`/api/graph/path?${params}`);
}

export function getLeaderboard(sortBy?: string, limit?: number) {
  const params = new URLSearchParams();
  if (sortBy) params.set('sort_by', sortBy);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return request<
    Array<{
      name: string;
      emitenCount: number;
      totalPercentage: number;
      avgPercentage: number;
      topHolding: { symbol: string; percentage: number } | null;
    }>
  >(`/api/intelligence/leaderboard${qs ? `?${qs}` : ''}`);
}

export function getClusters(minShared?: number, limit?: number) {
  const params = new URLSearchParams();
  if (minShared) params.set('min_shared', String(minShared));
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return request<
    Array<{ shareholders: string[]; commonEmitens: string[]; strength: number }>
  >(`/api/intelligence/clusters${qs ? `?${qs}` : ''}`);
}

export function getConcentration(symbol: string) {
  return request<{
    symbol: string;
    emitenName: string;
    score: number;
    herfindahlIndex: number;
    topShareholderPct: number;
    shareholderCount: number;
    tier: string;
  }>(`/api/intelligence/concentration/${encodeURIComponent(symbol)}`);
}

export function getAllConcentrations(sortBy?: string, order?: string, limit?: number) {
  const params = new URLSearchParams();
  if (sortBy) params.set('sort_by', sortBy);
  if (order) params.set('order', order);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return request<
    Array<{
      symbol: string;
      emitenName: string;
      score: number;
      herfindahlIndex: number;
      topShareholderPct: number;
      shareholderCount: number;
      tier: string;
    }>
  >(`/api/intelligence/concentrations${qs ? `?${qs}` : ''}`);
}

// --- Free Float ---

export function startFreeFloatFetch() {
  return request<{ message: string }>('/api/freefloat/fetch', { method: 'POST' });
}

export function getFreeFloatProgress() {
  return request<{ fetched: number; total: number; isRunning: boolean }>('/api/freefloat/progress');
}

export function getFreeFloatData(params?: { status?: string; search?: string; sort_by?: string; order?: string }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);
  if (params?.sort_by) qs.set('sort_by', params.sort_by);
  if (params?.order) qs.set('order', params.order);
  const s = qs.toString();
  return request<Array<{
    symbol: string; emiten_name: string; free_float_pct: number | null;
    share_outstanding: number | null; free_float_shares: number | null;
    shareholder_count: number | null; shareholder_date: string | null;
    board: string | null; compliance_status: string; fetched_at: string;
  }>>(`/api/freefloat/data${s ? `?${s}` : ''}`);
}
