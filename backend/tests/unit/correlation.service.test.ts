import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { createTestPool } from '../../src/database/connection.js';
import { insertEmitens, updateStatus } from '../../src/database/emiten.repository.js';
import { saveShareholdings } from '../../src/database/shareholding.repository.js';
import {
  getCorrelations,
  getCommonEmitens,
} from '../../src/services/correlation.service.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/shareholder_mapping_test';

describe('correlation.service', () => {
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

  describe('getCorrelations', () => {
    it('returns correlated shareholders with correct scores ordered descending', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
        { symbol: 'ASII', name: 'Astra International' },
      ]);
      await updateStatus(pool, 'BBCA', 'success');
      await updateStatus(pool, 'TLKM', 'success');
      await updateStatus(pool, 'ASII', 'success');

      // Holder A owns BBCA, TLKM, ASII
      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder A', percentage: 30.0 },
        { name: 'Holder B', percentage: 20.0 },
      ]);
      await saveShareholdings(pool, 'TLKM', [
        { name: 'Holder A', percentage: 40.0 },
        { name: 'Holder B', percentage: 15.0 },
        { name: 'Holder C', percentage: 10.0 },
      ]);
      await saveShareholdings(pool, 'ASII', [
        { name: 'Holder A', percentage: 25.0 },
        { name: 'Holder C', percentage: 35.0 },
      ]);

      const result = await getCorrelations(pool, 'Holder A');

      // Holder B shares BBCA, TLKM (score=2), Holder C shares TLKM, ASII (score=2)
      expect(result.data).toHaveLength(2);
      expect(result.data[0].correlationScore).toBe(2);
      expect(result.data[1].correlationScore).toBe(2);

      const holderB = result.data.find((d) => d.shareholderName === 'Holder B')!;
      expect(holderB.correlationScore).toBe(2);
      expect(holderB.commonEmitens.sort()).toEqual(['BBCA', 'TLKM']);

      const holderC = result.data.find((d) => d.shareholderName === 'Holder C')!;
      expect(holderC.correlationScore).toBe(2);
      expect(holderC.commonEmitens.sort()).toEqual(['ASII', 'TLKM']);
    });

    it('returns empty data when shareholder has no co-owners', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await updateStatus(pool, 'BBCA', 'success');

      await saveShareholdings(pool, 'BBCA', [
        { name: 'Solo Holder', percentage: 100.0 },
      ]);

      const result = await getCorrelations(pool, 'Solo Holder');

      expect(result.data).toHaveLength(0);
    });

    it('returns empty data for unknown shareholder', async () => {
      const result = await getCorrelations(pool, 'Unknown');

      expect(result.data).toHaveLength(0);
    });

    it('includes warning when data is incomplete', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);
      // Only BBCA is success, TLKM is still pending
      await updateStatus(pool, 'BBCA', 'success');

      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder A', percentage: 30.0 },
      ]);

      const result = await getCorrelations(pool, 'Holder A');

      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('1');
      expect(result.warning).toContain('2');
    });

    it('does not include warning when all data is complete', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await updateStatus(pool, 'BBCA', 'success');

      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder A', percentage: 50.0 },
      ]);

      const result = await getCorrelations(pool, 'Holder A');

      expect(result.warning).toBeUndefined();
    });
  });

  describe('getCommonEmitens', () => {
    it('returns emitens owned by both shareholders with name1 percentage', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
        { symbol: 'ASII', name: 'Astra International' },
      ]);
      await updateStatus(pool, 'BBCA', 'success');
      await updateStatus(pool, 'TLKM', 'success');
      await updateStatus(pool, 'ASII', 'success');

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
      ]);

      const result = await getCommonEmitens(pool, 'Holder A', 'Holder B');

      expect(result.data).toHaveLength(2);
      // Ordered by name1 (Holder A) percentage DESC
      expect(result.data[0]).toEqual({
        symbol: 'TLKM',
        emitenName: 'Telkom Indonesia',
        percentage: 40.0,
      });
      expect(result.data[1]).toEqual({
        symbol: 'BBCA',
        emitenName: 'Bank Central Asia',
        percentage: 30.0,
      });
    });

    it('returns empty data when shareholders share no emitens', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);
      await updateStatus(pool, 'BBCA', 'success');
      await updateStatus(pool, 'TLKM', 'success');

      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder A', percentage: 50.0 },
      ]);
      await saveShareholdings(pool, 'TLKM', [
        { name: 'Holder B', percentage: 50.0 },
      ]);

      const result = await getCommonEmitens(pool, 'Holder A', 'Holder B');

      expect(result.data).toHaveLength(0);
    });

    it('includes warning when data is incomplete', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);
      await updateStatus(pool, 'BBCA', 'success');

      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder A', percentage: 30.0 },
        { name: 'Holder B', percentage: 20.0 },
      ]);

      const result = await getCommonEmitens(pool, 'Holder A', 'Holder B');

      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('1');
      expect(result.warning).toContain('2');
    });

    it('does not include warning when all data is complete', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await updateStatus(pool, 'BBCA', 'success');

      await saveShareholdings(pool, 'BBCA', [
        { name: 'Holder A', percentage: 30.0 },
        { name: 'Holder B', percentage: 20.0 },
      ]);

      const result = await getCommonEmitens(pool, 'Holder A', 'Holder B');

      expect(result.warning).toBeUndefined();
    });
  });
});
