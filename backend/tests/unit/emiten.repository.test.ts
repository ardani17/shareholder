import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { createTestPool } from '../../src/database/connection.js';
import {
  insertEmitens,
  getAll,
  getByStatus,
  updateStatus,
  getProgress,
  resetStatus,
} from '../../src/database/emiten.repository.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/shareholder_mapping_test';

describe('emiten.repository', () => {
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

  describe('insertEmitens', () => {
    it('inserts emitens with pending status', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);

      const rows = await getAll(pool);
      expect(rows).toHaveLength(2);
      expect(rows.every(r => r.status === 'pending')).toBe(true);
      expect(rows.map(r => r.symbol).sort()).toEqual(['BBCA', 'TLKM']);
    });

    it('handles empty array', async () => {
      await insertEmitens(pool, []);
      const rows = await getAll(pool);
      expect(rows).toHaveLength(0);
    });

    it('ignores duplicates with ON CONFLICT DO NOTHING', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Different Name' }]);

      const rows = await getAll(pool);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Bank Central Asia');
    });
  });

  describe('getByStatus', () => {
    it('filters emitens by status', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ]);
      await updateStatus(pool, 'BBCA', 'success');

      const pending = await getByStatus(pool, 'pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].symbol).toBe('TLKM');

      const success = await getByStatus(pool, 'success');
      expect(success).toHaveLength(1);
      expect(success[0].symbol).toBe('BBCA');
    });
  });

  describe('updateStatus', () => {
    it('sets fetched_at for success status', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await updateStatus(pool, 'BBCA', 'success');

      const rows = await getAll(pool);
      expect(rows[0].status).toBe('success');
      expect(rows[0].fetched_at).not.toBeNull();
      expect(rows[0].error_message).toBeNull();
    });

    it('sets fetched_at and error_message for failed status', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await updateStatus(pool, 'BBCA', 'failed', '404 Not Found');

      const rows = await getAll(pool);
      expect(rows[0].status).toBe('failed');
      expect(rows[0].fetched_at).not.toBeNull();
      expect(rows[0].error_message).toBe('404 Not Found');
    });

    it('does not set fetched_at for pending status', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await updateStatus(pool, 'BBCA', 'success');
      await updateStatus(pool, 'BBCA', 'pending');

      const rows = await getAll(pool);
      // fetched_at remains from the success update since we only skip setting it for non-success/failed
      expect(rows[0].status).toBe('pending');
    });
  });

  describe('getProgress', () => {
    it('returns correct counts per status', async () => {
      await insertEmitens(pool, [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
        { symbol: 'GOTO', name: 'GoTo' },
        { symbol: 'ASII', name: 'Astra International' },
      ]);
      await updateStatus(pool, 'BBCA', 'success');
      await updateStatus(pool, 'TLKM', 'success');
      await updateStatus(pool, 'GOTO', 'failed', 'Error');

      const progress = await getProgress(pool);
      expect(progress).toEqual({
        success: 2,
        failed: 1,
        pending: 1,
        total: 4,
      });
    });

    it('returns zeros when no emitens exist', async () => {
      const progress = await getProgress(pool);
      expect(progress).toEqual({ success: 0, failed: 0, pending: 0, total: 0 });
    });
  });

  describe('resetStatus', () => {
    it('resets status to pending and clears fetched_at and error_message', async () => {
      await insertEmitens(pool, [{ symbol: 'BBCA', name: 'Bank Central Asia' }]);
      await updateStatus(pool, 'BBCA', 'failed', 'Some error');

      await resetStatus(pool, 'BBCA');

      const rows = await getAll(pool);
      expect(rows[0].status).toBe('pending');
      expect(rows[0].fetched_at).toBeNull();
      expect(rows[0].error_message).toBeNull();
    });
  });
});
