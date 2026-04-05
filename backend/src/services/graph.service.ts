import pg from 'pg';
import { GraphNode, GraphEdge } from '../types.js';

export async function getNodes(
  pool: pg.Pool,
  minEmitens?: number
): Promise<GraphNode[]> {
  // Get shareholder nodes with their emiten count
  const shareholderResult = await pool.query(
    `SELECT shareholder_name, COUNT(DISTINCT emiten_symbol) AS emiten_count
     FROM shareholdings
     GROUP BY shareholder_name`
  );

  const minCount = minEmitens ?? 1;

  // Filter shareholders by minEmitens
  const qualifyingShareholders = shareholderResult.rows.filter(
    (row) => parseInt(row.emiten_count, 10) >= minCount
  );

  const shareholderNames = new Set(
    qualifyingShareholders.map((row) => row.shareholder_name)
  );

  if (shareholderNames.size === 0) {
    return [];
  }

  // Get emiten nodes — only those connected to qualifying shareholders
  const emitenResult = await pool.query(
    `SELECT emiten_symbol, COUNT(DISTINCT shareholder_name) AS shareholder_count
     FROM shareholdings
     WHERE shareholder_name = ANY($1)
     GROUP BY emiten_symbol`,
    [Array.from(shareholderNames)]
  );

  const nodes: GraphNode[] = [];

  for (const row of emitenResult.rows) {
    nodes.push({
      id: `emiten:${row.emiten_symbol}`,
      type: 'emiten',
      label: row.emiten_symbol,
      size: parseInt(row.shareholder_count, 10),
    });
  }

  for (const row of qualifyingShareholders) {
    nodes.push({
      id: `shareholder:${row.shareholder_name}`,
      type: 'shareholder',
      label: row.shareholder_name,
      size: parseInt(row.emiten_count, 10),
    });
  }

  return nodes;
}

export async function getEdges(
  pool: pg.Pool,
  minEmitens?: number
): Promise<GraphEdge[]> {
  const minCount = minEmitens ?? 1;

  const result = await pool.query(
    `SELECT s.shareholder_name, s.emiten_symbol, s.percentage
     FROM shareholdings s
     JOIN (
       SELECT shareholder_name
       FROM shareholdings
       GROUP BY shareholder_name
       HAVING COUNT(DISTINCT emiten_symbol) >= $1
     ) q ON s.shareholder_name = q.shareholder_name`,
    [minCount]
  );

  return result.rows.map((row) => ({
    source: `shareholder:${row.shareholder_name}`,
    target: `emiten:${row.emiten_symbol}`,
    percentage: parseFloat(row.percentage),
  }));
}

export async function getSubgraph(
  pool: pg.Pool,
  nodeId: string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  if (nodeId.startsWith('emiten:')) {
    const symbol = nodeId.slice('emiten:'.length);

    // Get all shareholders of this emiten
    const result = await pool.query(
      `SELECT shareholder_name, percentage FROM shareholdings WHERE emiten_symbol = $1`,
      [symbol]
    );

    if (result.rows.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Emiten node: size = number of shareholders
    nodes.push({
      id: nodeId,
      type: 'emiten',
      label: symbol,
      size: result.rows.length,
    });

    // Get emiten counts for each shareholder to set their size
    const shareholderNames = result.rows.map((r) => r.shareholder_name);
    const countResult = await pool.query(
      `SELECT shareholder_name, COUNT(DISTINCT emiten_symbol) AS emiten_count
       FROM shareholdings
       WHERE shareholder_name = ANY($1)
       GROUP BY shareholder_name`,
      [shareholderNames]
    );
    const countMap = new Map(
      countResult.rows.map((r) => [r.shareholder_name, parseInt(r.emiten_count, 10)])
    );

    for (const row of result.rows) {
      nodes.push({
        id: `shareholder:${row.shareholder_name}`,
        type: 'shareholder',
        label: row.shareholder_name,
        size: countMap.get(row.shareholder_name) ?? 1,
      });
      edges.push({
        source: `shareholder:${row.shareholder_name}`,
        target: nodeId,
        percentage: parseFloat(row.percentage),
      });
    }
  } else if (nodeId.startsWith('shareholder:')) {
    const name = nodeId.slice('shareholder:'.length);

    // Get all emitens owned by this shareholder
    const result = await pool.query(
      `SELECT emiten_symbol, percentage FROM shareholdings WHERE shareholder_name = $1`,
      [name]
    );

    if (result.rows.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Shareholder node: size = number of emitens
    nodes.push({
      id: nodeId,
      type: 'shareholder',
      label: name,
      size: result.rows.length,
    });

    // Get shareholder counts for each emiten to set their size
    const emitenSymbols = result.rows.map((r) => r.emiten_symbol);
    const countResult = await pool.query(
      `SELECT emiten_symbol, COUNT(DISTINCT shareholder_name) AS shareholder_count
       FROM shareholdings
       WHERE emiten_symbol = ANY($1)
       GROUP BY emiten_symbol`,
      [emitenSymbols]
    );
    const countMap = new Map(
      countResult.rows.map((r) => [r.emiten_symbol, parseInt(r.shareholder_count, 10)])
    );

    for (const row of result.rows) {
      nodes.push({
        id: `emiten:${row.emiten_symbol}`,
        type: 'emiten',
        label: row.emiten_symbol,
        size: countMap.get(row.emiten_symbol) ?? 1,
      });
      edges.push({
        source: nodeId,
        target: `emiten:${row.emiten_symbol}`,
        percentage: parseFloat(row.percentage),
      });
    }
  }

  return { nodes, edges };
}
