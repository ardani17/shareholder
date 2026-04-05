import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { createTestPool } from '../../src/database/connection.js';
import { insertEmitens, updateStatus } from '../../src/database/emiten.repository.js';
import { saveShareholdings } from '../../src/database/shareholding.repository.js';
import { getNodes, getEdges, getSubgraph } from '../../src/services/graph.service.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/shareholder_mapping_test';

describe('graph.service', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = createTestPool(DATABASE_URL);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM shareholdings');
    await pool.query('DELETE FROM emitens');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM shareholdings');
    await pool.query('DELETE FROM emitens');
    await pool.end();
  });

  async function seedData() {
    await insertEmitens(pool, [
      { symbol: 'BBCA', name: 'Bank Central Asia' },
      { symbol: 'TLKM', name: 'Telkom Indonesia' },
      { symbol: 'ASII', name: 'Astra International' },
    ]);
    await updateStatus(pool, 'BBCA', 'success');
    await updateStatus(pool, 'TLKM', 'success');
    await updateStatus(pool, 'ASII', 'success');

    // Holder A owns BBCA, TLKM, ASII (3 emitens)
    // Holder B owns BBCA, TLKM (2 emitens)
    // Holder C owns ASII only (1 emiten)
    await saveShareholdings(pool, 'BBCA', [
      { name: 'Holder A', percentage: 30.0 },
      { name: 'Holder B', percentage: 20.0 },
    ]);
    await saveShareholdings(pool, 'TLKM', [
      { name: 'Holder A', percentage: 40.0 },
      { name: 'Holder B', percentage: 15.0 },
    ]);
    await saveShareholdings(pool, 'ASII', [
      { name: 'Holder A', percentage: 25.0 },
      { name: 'Holder C', percentage: 35.0 },
    ]);
  }

  describe('getNodes', () => {
    it('returns emiten and shareholder nodes with correct sizes', async () => {
      await seedData();
      const nodes = await getNodes(pool);

      // 3 emitens + 3 shareholders = 6 nodes
      expect(nodes).toHaveLength(6);

      const emitenNodes = nodes.filter((n) => n.type === 'emiten');
      const shareholderNodes = nodes.filter((n) => n.type === 'shareholder');
      expect(emitenNodes).toHaveLength(3);
      expect(shareholderNodes).toHaveLength(3);

      // Holder A has 3 emitens
      const holderA = nodes.find((n) => n.id === 'shareholder:Holder A')!;
      expect(holderA.label).toBe('Holder A');
      expect(holderA.size).toBe(3);

      // BBCA has 2 shareholders (Holder A, Holder B)
      const bbca = nodes.find((n) => n.id === 'emiten:BBCA')!;
      expect(bbca.label).toBe('BBCA');
      expect(bbca.size).toBe(2);
    });

    it('filters shareholders by minEmitens', async () => {
      await seedData();
      // minEmitens=2 should exclude Holder C (only 1 emiten)
      const nodes = await getNodes(pool, 2);

      const shareholderNodes = nodes.filter((n) => n.type === 'shareholder');
      expect(shareholderNodes).toHaveLength(2);
      expect(shareholderNodes.find((n) => n.label === 'Holder C')).toBeUndefined();

      // ASII should still appear because Holder A (3 emitens) owns it
      const asii = nodes.find((n) => n.id === 'emiten:ASII');
      expect(asii).toBeDefined();
    });

    it('excludes emiten nodes with no qualifying shareholders', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'SOLO', name: 'Solo Emiten' },
      ]);
      await updateStatus(pool, 'BBCA', 'success');
      await updateStatus(pool, 'SOLO', 'success');

      await saveShareholdings(pool, 'BBCA', [
        { name: 'Big Holder', percentage: 50.0 },
      ]);
      await saveShareholdings(pool, 'SOLO', [
        { name: 'Small Holder', percentage: 10.0 },
      ]);

      // minEmitens=2: neither holder qualifies (both have 1 emiten)
      const nodes = await getNodes(pool, 2);
      expect(nodes).toHaveLength(0);
    });

    it('returns empty array when no shareholdings exist', async () => {
      const nodes = await getNodes(pool);
      expect(nodes).toHaveLength(0);
    });
  });

  describe('getEdges', () => {
    it('returns one edge per shareholding record', async () => {
      await seedData();
      const edges = await getEdges(pool);

      // 6 shareholding records total
      expect(edges).toHaveLength(6);

      const bbcaEdges = edges.filter((e) => e.target === 'emiten:BBCA');
      expect(bbcaEdges).toHaveLength(2);

      const holderAEdge = bbcaEdges.find((e) => e.source === 'shareholder:Holder A')!;
      expect(holderAEdge.percentage).toBe(30.0);
    });

    it('filters edges by minEmitens', async () => {
      await seedData();
      // minEmitens=3: only Holder A qualifies (3 emitens)
      const edges = await getEdges(pool, 3);

      expect(edges).toHaveLength(3); // Holder A has 3 edges
      for (const edge of edges) {
        expect(edge.source).toBe('shareholder:Holder A');
      }
    });

    it('returns empty array when no shareholdings exist', async () => {
      const edges = await getEdges(pool);
      expect(edges).toHaveLength(0);
    });
  });

  describe('getSubgraph', () => {
    it('returns subgraph for emiten node', async () => {
      await seedData();
      const result = await getSubgraph(pool, 'emiten:BBCA');

      // BBCA + Holder A + Holder B = 3 nodes
      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);

      const emitenNode = result.nodes.find((n) => n.id === 'emiten:BBCA')!;
      expect(emitenNode.type).toBe('emiten');
      expect(emitenNode.label).toBe('BBCA');
      expect(emitenNode.size).toBe(2);

      const holderA = result.nodes.find((n) => n.id === 'shareholder:Holder A')!;
      expect(holderA.size).toBe(3); // Holder A owns 3 emitens total
    });

    it('returns subgraph for shareholder node', async () => {
      await seedData();
      const result = await getSubgraph(pool, 'shareholder:Holder A');

      // Holder A + BBCA + TLKM + ASII = 4 nodes
      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(3);

      const shareholderNode = result.nodes.find((n) => n.id === 'shareholder:Holder A')!;
      expect(shareholderNode.type).toBe('shareholder');
      expect(shareholderNode.size).toBe(3);

      for (const edge of result.edges) {
        expect(edge.source).toBe('shareholder:Holder A');
      }
    });

    it('returns empty subgraph for unknown emiten', async () => {
      const result = await getSubgraph(pool, 'emiten:UNKNOWN');
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('returns empty subgraph for unknown shareholder', async () => {
      const result = await getSubgraph(pool, 'shareholder:Unknown');
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });
  });
});
