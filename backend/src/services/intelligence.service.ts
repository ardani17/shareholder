import pg from 'pg';
import {
  GraphSearchResult,
  PathStep,
  ShareholderLeaderboard,
  OwnershipCluster,
  ConcentrationScore,
} from '../types.js';

/** Search graph nodes by name (shareholder or emiten) */
export async function searchNodes(
  pool: pg.Pool,
  query: string,
  limit = 20
): Promise<GraphSearchResult[]> {
  const results: GraphSearchResult[] = [];
  const q = `%${query}%`;

  // Search emitens
  const emitens = await pool.query(
    `SELECT e.symbol, e.name, COUNT(s.id) as connection_count
     FROM emitens e
     LEFT JOIN shareholdings s ON e.symbol = s.emiten_symbol
     WHERE e.symbol ILIKE $1 OR e.name ILIKE $1
     GROUP BY e.symbol, e.name
     ORDER BY connection_count DESC
     LIMIT $2`,
    [q, limit]
  );
  for (const r of emitens.rows) {
    results.push({
      id: `emiten:${r.symbol}`,
      type: 'emiten',
      label: `${r.symbol} - ${r.name}`,
      size: parseInt(r.connection_count, 10),
    });
  }

  // Search shareholders
  const shareholders = await pool.query(
    `SELECT shareholder_name, COUNT(DISTINCT emiten_symbol) as emiten_count
     FROM shareholdings
     WHERE shareholder_name ILIKE $1
     GROUP BY shareholder_name
     ORDER BY emiten_count DESC
     LIMIT $2`,
    [q, limit]
  );
  for (const r of shareholders.rows) {
    results.push({
      id: `shareholder:${r.shareholder_name}`,
      type: 'shareholder',
      label: r.shareholder_name,
      size: parseInt(r.emiten_count, 10),
    });
  }

  return results;
}

/** Find connection path between two nodes (BFS through shared emitens) */
export async function findPath(
  pool: pg.Pool,
  fromId: string,
  toId: string,
  maxDepth = 4
): Promise<{ path: PathStep[]; found: boolean }> {
  // Extract names from node IDs
  const fromName = fromId.includes(':') ? fromId.split(':').slice(1).join(':') : fromId;
  const toName = toId.includes(':') ? toId.split(':').slice(1).join(':') : toId;
  const fromType = fromId.startsWith('emiten:') ? 'emiten' : 'shareholder';
  const toType = toId.startsWith('emiten:') ? 'emiten' : 'shareholder';

  // BFS to find shortest path
  interface QueueItem {
    nodeId: string;
    nodeType: 'emiten' | 'shareholder';
    nodeName: string;
    path: PathStep[];
  }

  const visited = new Set<string>();
  const queue: QueueItem[] = [{ nodeId: fromId, nodeType: fromType, nodeName: fromName, path: [] }];
  visited.add(fromId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.path.length >= maxDepth) continue;

    if (current.nodeType === 'shareholder') {
      // Get all emitens this shareholder owns
      const result = await pool.query(
        `SELECT emiten_symbol, percentage FROM shareholdings WHERE shareholder_name = $1`,
        [current.nodeName]
      );
      for (const row of result.rows) {
        const nextId = `emiten:${row.emiten_symbol}`;
        const step: PathStep = {
          from: current.nodeId,
          to: nextId,
          via: row.emiten_symbol,
          percentage: parseFloat(row.percentage),
        };
        const newPath = [...current.path, step];

        if (nextId === toId || (toType === 'emiten' && row.emiten_symbol === toName)) {
          return { path: newPath, found: true };
        }
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ nodeId: nextId, nodeType: 'emiten', nodeName: row.emiten_symbol, path: newPath });
        }
      }
    } else {
      // Get all shareholders of this emiten
      const result = await pool.query(
        `SELECT shareholder_name, percentage FROM shareholdings WHERE emiten_symbol = $1`,
        [current.nodeName]
      );
      for (const row of result.rows) {
        const nextId = `shareholder:${row.shareholder_name}`;
        const step: PathStep = {
          from: current.nodeId,
          to: nextId,
          via: current.nodeName,
          percentage: parseFloat(row.percentage),
        };
        const newPath = [...current.path, step];

        if (nextId === toId || (toType === 'shareholder' && row.shareholder_name === toName)) {
          return { path: newPath, found: true };
        }
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ nodeId: nextId, nodeType: 'shareholder', nodeName: row.shareholder_name, path: newPath });
        }
      }
    }
  }

  return { path: [], found: false };
}

/** Top shareholders leaderboard */
export async function getLeaderboard(
  pool: pg.Pool,
  sortBy: 'emiten_count' | 'total_percentage' = 'emiten_count',
  limit = 50
): Promise<ShareholderLeaderboard[]> {
  const result = await pool.query(
    `SELECT 
       shareholder_name,
       COUNT(DISTINCT emiten_symbol) as emiten_count,
       SUM(percentage) as total_percentage,
       AVG(percentage) as avg_percentage
     FROM shareholdings
     GROUP BY shareholder_name
     ORDER BY ${sortBy === 'total_percentage' ? 'total_percentage' : 'emiten_count'} DESC
     LIMIT $1`,
    [limit]
  );

  const names = result.rows.map((r) => r.shareholder_name);
  // Get top holding for each shareholder
  const topHoldings = await pool.query(
    `SELECT DISTINCT ON (shareholder_name) shareholder_name, emiten_symbol, percentage
     FROM shareholdings
     WHERE shareholder_name = ANY($1)
     ORDER BY shareholder_name, percentage DESC`,
    [names]
  );
  const topMap = new Map(
    topHoldings.rows.map((r) => [r.shareholder_name, { symbol: r.emiten_symbol, percentage: parseFloat(r.percentage) }])
  );

  return result.rows.map((r) => ({
    name: r.shareholder_name,
    emitenCount: parseInt(r.emiten_count, 10),
    totalPercentage: parseFloat(parseFloat(r.total_percentage).toFixed(2)),
    avgPercentage: parseFloat(parseFloat(r.avg_percentage).toFixed(2)),
    topHolding: topMap.get(r.shareholder_name) ?? null,
  }));
}

/** Detect co-ownership clusters */
export async function getClusters(
  pool: pg.Pool,
  minShared = 3,
  limit = 20
): Promise<OwnershipCluster[]> {
  const result = await pool.query(
    `SELECT s1.shareholder_name as sh1, s2.shareholder_name as sh2,
            COUNT(DISTINCT s1.emiten_symbol) as shared_count,
            ARRAY_AGG(DISTINCT s1.emiten_symbol ORDER BY s1.emiten_symbol) as common_emitens
     FROM shareholdings s1
     JOIN shareholdings s2 ON s1.emiten_symbol = s2.emiten_symbol
       AND s1.shareholder_name < s2.shareholder_name
     GROUP BY s1.shareholder_name, s2.shareholder_name
     HAVING COUNT(DISTINCT s1.emiten_symbol) >= $1
     ORDER BY shared_count DESC
     LIMIT $2`,
    [minShared, limit]
  );

  return result.rows.map((r) => ({
    shareholders: [r.sh1, r.sh2],
    commonEmitens: r.common_emitens,
    strength: parseInt(r.shared_count, 10),
  }));
}

/** Calculate ownership concentration score for an emiten */
export async function getConcentration(
  pool: pg.Pool,
  symbol: string
): Promise<ConcentrationScore | null> {
  const result = await pool.query(
    `SELECT s.shareholder_name, s.percentage, e.name as emiten_name
     FROM shareholdings s
     JOIN emitens e ON s.emiten_symbol = e.symbol
     WHERE s.emiten_symbol = $1
     ORDER BY s.percentage DESC`,
    [symbol]
  );

  if (result.rows.length === 0) return null;

  const percentages = result.rows.map((r) => parseFloat(r.percentage));
  const total = percentages.reduce((a, b) => a + b, 0);

  // Herfindahl-Hirschman Index (normalized to 0-1)
  const shares = percentages.map((p) => p / total);
  const hhi = shares.reduce((sum, s) => sum + s * s, 0);

  let tier: ConcentrationScore['tier'];
  if (hhi >= 0.5) tier = 'highly_concentrated';
  else if (hhi >= 0.25) tier = 'concentrated';
  else if (hhi >= 0.15) tier = 'moderate';
  else tier = 'dispersed';

  return {
    symbol,
    emitenName: result.rows[0].emiten_name,
    score: parseFloat((hhi * 100).toFixed(1)),
    herfindahlIndex: parseFloat(hhi.toFixed(4)),
    topShareholderPct: percentages[0],
    shareholderCount: result.rows.length,
    tier,
  };
}

/** Batch concentration scores for all emitens */
export async function getAllConcentrations(
  pool: pg.Pool,
  sortBy: 'score' | 'shareholder_count' = 'score',
  order: 'asc' | 'desc' = 'desc',
  limit = 50
): Promise<ConcentrationScore[]> {
  const result = await pool.query(
    `SELECT s.emiten_symbol, e.name as emiten_name,
            COUNT(*) as shareholder_count,
            MAX(s.percentage) as top_pct,
            ARRAY_AGG(s.percentage ORDER BY s.percentage DESC) as percentages
     FROM shareholdings s
     JOIN emitens e ON s.emiten_symbol = e.symbol
     GROUP BY s.emiten_symbol, e.name
     ORDER BY s.emiten_symbol`
  );

  const scores: ConcentrationScore[] = result.rows.map((r) => {
    const pcts = r.percentages.map((p: string) => parseFloat(p));
    const total = pcts.reduce((a: number, b: number) => a + b, 0);
    const shares = pcts.map((p: number) => p / total);
    const hhi = shares.reduce((sum: number, s: number) => sum + s * s, 0);

    let tier: ConcentrationScore['tier'];
    if (hhi >= 0.5) tier = 'highly_concentrated';
    else if (hhi >= 0.25) tier = 'concentrated';
    else if (hhi >= 0.15) tier = 'moderate';
    else tier = 'dispersed';

    return {
      symbol: r.emiten_symbol,
      emitenName: r.emiten_name,
      score: parseFloat((hhi * 100).toFixed(1)),
      herfindahlIndex: parseFloat(hhi.toFixed(4)),
      topShareholderPct: parseFloat(r.top_pct),
      shareholderCount: parseInt(r.shareholder_count, 10),
      tier,
    };
  });

  scores.sort((a, b) => {
    const field = sortBy === 'shareholder_count' ? 'shareholderCount' : 'score';
    return order === 'desc' ? b[field] - a[field] : a[field] - b[field];
  });

  return scores.slice(0, limit);
}
