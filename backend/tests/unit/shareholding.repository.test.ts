import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { createTestPool } from '../../src/database/connection.js';
import { insertEmitens } from '../../src/database/emiten.repository.js';
import {
  saveShareholdings,
  getByEmiten,
  getByShareholder,
  getAllShareholders,
  deleteByEmiten,
  searchShareholders,
  searchEmitens,
} from '../../src/database/shareholding.repository.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/shareholder_mapping_test';

describe('shareholding.repository', () => {
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

  describe('saveShareholdings', () => {
    it('inserts shareholders for an emiten', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await saveShareholdings(pool, 'BBCA', [
        { name: 'FarIndo Investments', percentage: 47.15 },
        { name: 'Anthony Salim', percentage: 2.31 },
      ]);

      const rows = await getByEmiten(pool, 'BBCA');
      expect(rows).toHaveLength(2);
      expect(rows[0].shareholder_name).toBe('FarIndo Investments');
      expect(rows[0].percentage).toBe(47.15);
    });

    it('replaces old data in a transaction (refresh strategy)', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await saveShareholdings(pool, 'BBCA', [
        { name: 'Old Holder', percentage: 50.0 },
      ]);

      await saveShareholdings(pool, 'BBCA', [
        { name: 'New Holder A', percentage: 30.0 },
        { name: 'New Holder B', percentage: 20.0 },
      ]);

      const rows = await getByEmiten(pool, 'BBCA');
      expect(rows).toHaveLength(2);
      expect(rows.map(r => r.shareholder_name).sort()).toEqual(['New Holder A', 'New Holder B']);
    });

    it('handles empty shareholders array', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder', percentage: 10.0 },
      ]);

      await saveShareholdings(pool, 'BBCA', []);

      const rows = await getByEmiten(pool, 'BBCA');
      expect(rows).toHaveLength(0);
    });
  });

  describe('getByEmiten', () => {
    it('returns shareholders ordered by percentage DESC', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await saveShareholdings(pool, 'BBCA', [
        { name: 'Small Holder', percentage: 2.0 },
        { name: 'Big Holder', percentage: 50.0 },
        { name: 'Mid Holder', percentage: 15.0 },
      ]);

      const rows = await getByEmiten(pool, 'BBCA');
      expect(rows[0].percentage).toBe(50.0);
      expect(rows[1].percentage).toBe(15.0);
      expect(rows[2].percentage).toBe(2.0);
    });

    it('returns empty array for unknown emiten', async () => {
      const rows = await getByEmiten(pool, 'ZZZZ');
      expect(rows).toHaveLength(0);
    });
  });

  describe('getByShareholder', () => {
    it('returns emitens owned by a shareholder with emiten name', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);
      await saveShareholdings(pool, 'BBCA', [{ name: 'Pemerintah RI', percentage: 10.0 }]);
      await saveShareholdings(pool, 'TLKM', [{ name: 'Pemerintah RI', percentage: 52.09 }]);

      const rows = await getByShareholder(pool, 'Pemerintah RI');
      expect(rows).toHaveLength(2);
      expect(rows[0].symbol).toBe('TLKM');
      expect(rows[0].emiten_name).toBe('Telkom Indonesia');
      expect(rows[0].percentage).toBe(52.09);
      expect(rows[1].symbol).toBe('BBCA');
    });

    it('returns empty array for unknown shareholder', async () => {
      const rows = await getByShareholder(pool, 'Unknown');
      expect(rows).toHaveLength(0);
    });
  });

  describe('getAllShareholders', () => {
    it('returns unique shareholders with emiten count ordered by count DESC', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
        { symbol: 'ASII', name: 'Astra International' },
      ]);
      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder A', percentage: 30.0 },
        { name: 'Holder B', percentage: 20.0 },
      ]);
      await saveShareholdings(pool, 'TLKM', [
        { name: 'Holder A', percentage: 40.0 },
      ]);
      await saveShareholdings(pool, 'ASII', [
        { name: 'Holder A', percentage: 10.0 },
        { name: 'Holder B', percentage: 5.0 },
      ]);

      const rows = await getAllShareholders(pool);
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Holder A');
      expect(rows[0].emitenCount).toBe(3);
      expect(rows[1].name).toBe('Holder B');
      expect(rows[1].emitenCount).toBe(2);
    });

    it('filters by search term (case-insensitive)', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await saveShareholdings(pool, 'BBCA', [
        { name: 'Pemerintah RI', percentage: 30.0 },
        { name: 'FarIndo Investments', percentage: 20.0 },
      ]);

      const rows = await getAllShareholders(pool, 'pemerintah');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Pemerintah RI');
    });

    it('returns empty array when no match', async () => {
      const rows = await getAllShareholders(pool, 'nonexistent');
      expect(rows).toHaveLength(0);
    });
  });

  describe('deleteByEmiten', () => {
    it('deletes all shareholdings for an emiten', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder A', percentage: 30.0 },
        { name: 'Holder B', percentage: 20.0 },
      ]);

      await deleteByEmiten(pool, 'BBCA');

      const rows = await getByEmiten(pool, 'BBCA');
      expect(rows).toHaveLength(0);
    });
  });

  describe('searchShareholders', () => {
    it('returns unique shareholder names matching search', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);
      await saveShareholdings(pool, 'BBCA', [{ name: 'FarIndo Investments', percentage: 47.0 }]);
      await saveShareholdings(pool, 'TLKM', [{ name: 'FarIndo Investments', percentage: 10.0 }]);

      const names = await searchShareholders(pool, 'farindo');
      expect(names).toHaveLength(1);
      expect(names[0]).toBe('FarIndo Investments');
    });

    it('returns empty array when no match', async () => {
      const names = await searchShareholders(pool, 'zzz');
      expect(names).toHaveLength(0);
    });
  });

  describe('searchEmitens', () => {
    it('searches by symbol (case-insensitive)', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);

      const results = await searchEmitens(pool, 'bbca');
      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('BBCA');
    });

    it('searches by name (case-insensitive)', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);

      const results = await searchEmitens(pool, 'telkom');
      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('TLKM');
      expect(results[0].name).toBe('Telkom Indonesia');
    });

    it('returns empty array when no match', async () => {
      const results = await searchEmitens(pool, 'zzz');
      expect(results).toHaveLength(0);
    });
  });
});
