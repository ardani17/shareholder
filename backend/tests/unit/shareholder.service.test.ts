import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { createTestPool } from '../../src/database/connection.js';
import { insertEmitens, updateStatus } from '../../src/database/emiten.repository.js';
import { saveShareholdings } from '../../src/database/shareholding.repository.js';
import {
  getAllShareholders,
  getEmitensByShareholder,
  getShareholdersByEmiten,
} from '../../src/services/shareholder.service.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/shareholder_mapping_test';

describe('shareholder.service', () => {
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

  describe('getAllShareholders', () => {
    it('returns shareholders with emiten count and completeness metadata', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
        { symbol: 'ASII', name: 'Astra International' },
      ]);
      await updateStatus(pool, 'BBCA', 'success');
      await updateStatus(pool, 'TLKM', 'success');

      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder A', percentage: 30.0 },
        { name: 'Holder B', percentage: 20.0 },
      ]);
      await saveShareholdings(pool, 'TLKM', [
        { name: 'Holder A', percentage: 40.0 },
      ]);

      const result = await getAllShareholders(pool);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Holder A');
      expect(result.data[0].emitenCount).toBe(2);
      expect(result.data[1].name).toBe('Holder B');
      expect(result.data[1].emitenCount).toBe(1);
      expect(result.completeness).toEqual({
        processedEmitens: 2,
        totalEmitens: 3,
      });
    });

    it('supports search filter', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await saveShareholdings(pool, 'BBCA', [
        { name: 'Pemerintah RI', percentage: 30.0 },
        { name: 'FarIndo Investments', percentage: 20.0 },
      ]);

      const result = await getAllShareholders(pool, 'pemerintah');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Pemerintah RI');
    });

    it('returns empty data with completeness when no shareholders', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);

      const result = await getAllShareholders(pool);

      expect(result.data).toHaveLength(0);
      expect(result.completeness.totalEmitens).toBe(1);
      expect(result.completeness.processedEmitens).toBe(0);
    });
  });

  describe('getEmitensByShareholder', () => {
    it('returns emitens mapped to ShareholderEmiten type with completeness', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);
      await updateStatus(pool, 'BBCA', 'success');
      await updateStatus(pool, 'TLKM', 'success');

      await saveShareholdings(pool, 'BBCA', [{ name: 'Pemerintah RI', percentage: 10.0 }]);
      await saveShareholdings(pool, 'TLKM', [{ name: 'Pemerintah RI', percentage: 52.09 }]);

      const result = await getEmitensByShareholder(pool, 'Pemerintah RI');

      expect(result.data).toHaveLength(2);
      // Ordered by percentage DESC
      expect(result.data[0]).toEqual({
        symbol: 'TLKM',
        emitenName: 'Telkom Indonesia',
        percentage: 52.09,
      });
      expect(result.data[1]).toEqual({
        symbol: 'BBCA',
        emitenName: 'Bank Central Asia',
        percentage: 10.0,
      });
      expect(result.completeness).toEqual({
        processedEmitens: 2,
        totalEmitens: 2,
      });
    });

    it('returns empty data for unknown shareholder', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);

      const result = await getEmitensByShareholder(pool, 'Unknown');

      expect(result.data).toHaveLength(0);
      expect(result.completeness.totalEmitens).toBe(1);
    });
  });

  describe('getShareholdersByEmiten', () => {
    it('returns shareholders mapped to EmitenShareholder type with completeness', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await updateStatus(pool, 'BBCA', 'success');

      await saveShareholdings(pool, 'BBCA', [
        { name: 'Small Holder', percentage: 2.0 },
        { name: 'Big Holder', percentage: 50.0 },
        { name: 'Mid Holder', percentage: 15.0 },
      ]);

      const result = await getShareholdersByEmiten(pool, 'BBCA');

      expect(result.data).toHaveLength(3);
      // Ordered by percentage DESC
      expect(result.data[0]).toEqual({ shareholderName: 'Big Holder', percentage: 50.0 });
      expect(result.data[1]).toEqual({ shareholderName: 'Mid Holder', percentage: 15.0 });
      expect(result.data[2]).toEqual({ shareholderName: 'Small Holder', percentage: 2.0 });
      expect(result.completeness).toEqual({
        processedEmitens: 1,
        totalEmitens: 1,
      });
    });

    it('returns empty data for unknown emiten', async () => {
      const result = await getShareholdersByEmiten(pool, 'ZZZZ');

      expect(result.data).toHaveLength(0);
      expect(result.completeness.totalEmitens).toBe(0);
    });
  });
});
