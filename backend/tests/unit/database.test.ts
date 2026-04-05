import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { createTestPool } from '../../src/database/connection.js';
import { runMigrations } from '../../src/database/migrations.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/shareholder_mapping_test';

describe('database connection', () => {
  it('createTestPool returns a pg.Pool instance', () => {
    const pool = createTestPool(DATABASE_URL);
    expect(pool).toBeInstanceOf(pg.Pool);
    pool.end();
  });
});

describe('database migrations', () => {
  let pool: pg.Pool;

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM shareholdings');
      await pool.query('DELETE FROM emitens');
      await pool.end();
    }
  });

  it('runMigrations creates emitens and shareholdings tables', async () => {
    pool = createTestPool(DATABASE_URL);
    await runMigrations(pool);

    // Verify emitens table exists with correct columns
    const emitenCols = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'emitens'
      ORDER BY ordinal_position
    `);
    const emitenColNames = emitenCols.rows.map((r: { column_name: string }) => r.column_name);
    expect(emitenColNames).toContain('symbol');
    expect(emitenColNames).toContain('name');
    expect(emitenColNames).toContain('status');
    expect(emitenColNames).toContain('fetched_at');
    expect(emitenColNames).toContain('error_message');

    // Verify shareholdings table exists with correct columns
    const shCols = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'shareholdings'
      ORDER BY ordinal_position
    `);
    const shColNames = shCols.rows.map((r: { column_name: string }) => r.column_name);
    expect(shColNames).toContain('id');
    expect(shColNames).toContain('emiten_symbol');
    expect(shColNames).toContain('shareholder_name');
    expect(shColNames).toContain('percentage');
    expect(shColNames).toContain('fetched_at');
  });

  it('emitens status check constraint works', async () => {
    // Valid status
    await pool.query(`INSERT INTO emitens (symbol, name, status) VALUES ('TEST1', 'Test Emiten', 'pending')`);
    const res = await pool.query(`SELECT status FROM emitens WHERE symbol = 'TEST1'`);
    expect(res.rows[0].status).toBe('pending');

    // Invalid status should fail
    await expect(
      pool.query(`INSERT INTO emitens (symbol, name, status) VALUES ('TEST2', 'Test', 'invalid')`)
    ).rejects.toThrow();

    // Cleanup
    await pool.query(`DELETE FROM emitens WHERE symbol = 'TEST1'`);
  });

  it('shareholdings percentage check constraint rejects < 1.0', async () => {
    await pool.query(`INSERT INTO emitens (symbol, name) VALUES ('CHK1', 'Check Emiten')`);

    await expect(
      pool.query(`INSERT INTO shareholdings (emiten_symbol, shareholder_name, percentage, fetched_at) VALUES ('CHK1', 'Holder', 0.5, NOW())`)
    ).rejects.toThrow();

    // Valid percentage should work
    await pool.query(`INSERT INTO shareholdings (emiten_symbol, shareholder_name, percentage, fetched_at) VALUES ('CHK1', 'Holder', 1.0, NOW())`);
    const res = await pool.query(`SELECT percentage FROM shareholdings WHERE emiten_symbol = 'CHK1'`);
    expect(parseFloat(res.rows[0].percentage)).toBe(1.0);

    // Cleanup
    await pool.query(`DELETE FROM shareholdings WHERE emiten_symbol = 'CHK1'`);
    await pool.query(`DELETE FROM emitens WHERE symbol = 'CHK1'`);
  });

  it('cascade delete removes shareholdings when emiten is deleted', async () => {
    await pool.query(`INSERT INTO emitens (symbol, name) VALUES ('CAS1', 'Cascade Test')`);
    await pool.query(`INSERT INTO shareholdings (emiten_symbol, shareholder_name, percentage, fetched_at) VALUES ('CAS1', 'Holder A', 5.0, NOW())`);

    await pool.query(`DELETE FROM emitens WHERE symbol = 'CAS1'`);

    const res = await pool.query(`SELECT * FROM shareholdings WHERE emiten_symbol = 'CAS1'`);
    expect(res.rows).toHaveLength(0);
  });

  it('runMigrations is idempotent', async () => {
    // Running migrations again should not throw
    await expect(runMigrations(pool)).resolves.not.toThrow();
  });
});
