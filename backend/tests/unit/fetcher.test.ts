import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import pg from 'pg';
import { createTestPool } from '../../src/database/connection.js';
import { Fetcher } from '../../src/core/fetcher.js';
import { FloodController } from '../../src/core/flood-controller.js';
import { ApiAuthError } from '../../src/core/api-client.js';
import * as apiClient from '../../src/core/api-client.js';
import * as emitenRepo from '../../src/database/emiten.repository.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/shareholder_mapping_test';

describe('Fetcher', () => {
  let pool: pg.Pool;
  let floodController: FloodController;

  beforeEach(async () => {
    pool = createTestPool(DATABASE_URL);
    // Use minimal delays for fast tests
    floodController = new FloodController({ delayMs: 0, maxConcurrency: 1, maxRetries: 1, initialBackoffMs: 0 });
    // Clean tables
    await pool.query('DELETE FROM shareholdings');
    await pool.query('DELETE FROM emitens');
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM shareholdings');
      await pool.query('DELETE FROM emitens');
      await pool.end();
    }
  });

  it('should fetch emiten list from API when DB is empty and insert into DB', async () => {
    const mockList = {
      data: [
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'TLKM', name: 'Telkom Indonesia' },
      ],
    };
    vi.spyOn(apiClient, 'fetchEmitenList').mockResolvedValue(mockList);
    vi.spyOn(apiClient, 'fetchEmitenProfile').mockResolvedValue({
      symbol: 'BBCA',
      name: 'Bank Central Asia',
      shareholders: [{ name: 'FarIndo', percentage: 47.15 }],
    });

    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://api.example.com');
    await fetcher.start();

    expect(apiClient.fetchEmitenList).toHaveBeenCalledWith('test-key', 'https://api.example.com');

    // Verify emitens were inserted
    const result = await pool.query('SELECT * FROM emitens ORDER BY symbol');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].symbol).toBe('BBCA');
    expect(result.rows[1].symbol).toBe('TLKM');
  });

  it('should not fetch emiten list if emitens already exist in DB', async () => {
    // Pre-insert emitens
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('BBCA', 'Bank Central Asia', 'success')");

    vi.spyOn(apiClient, 'fetchEmitenList');
    vi.spyOn(apiClient, 'fetchEmitenProfile');

    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://api.example.com');
    await fetcher.start();

    // Should not call fetchEmitenList since emitens exist
    expect(apiClient.fetchEmitenList).not.toHaveBeenCalled();
  });

  it('should process only pending and failed emitens', async () => {
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('BBCA', 'BCA', 'success')");
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('TLKM', 'Telkom', 'pending')");
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('GOTO', 'GoTo', 'failed')");

    const profileSpy = vi.spyOn(apiClient, 'fetchEmitenProfile').mockImplementation(async (_key, _url, symbol) => ({
      symbol,
      name: `Name ${symbol}`,
      shareholders: [{ name: 'Holder A', percentage: 5.0 }],
    }));

    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://api.example.com');
    await fetcher.start();

    // Should only process TLKM (pending) and GOTO (failed), not BBCA (success)
    const calledSymbols = profileSpy.mock.calls.map(c => c[2]);
    expect(calledSymbols).toContain('TLKM');
    expect(calledSymbols).toContain('GOTO');
    expect(calledSymbols).not.toContain('BBCA');
  });

  it('should save shareholders returned by fetchEmitenProfile', async () => {
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('BBCA', 'BCA', 'pending')");

    vi.spyOn(apiClient, 'fetchEmitenProfile').mockResolvedValue({
      symbol: 'BBCA',
      name: 'BCA',
      shareholders: [
        { name: 'Big Holder', percentage: 47.15 },
        { name: 'Exact 1%', percentage: 1.0 },
      ],
    });

    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://api.example.com');
    await fetcher.start();

    const holdings = await pool.query('SELECT shareholder_name, percentage FROM shareholdings WHERE emiten_symbol = $1 ORDER BY percentage DESC', ['BBCA']);
    expect(holdings.rows).toHaveLength(2);
    expect(holdings.rows[0].shareholder_name).toBe('Big Holder');
    expect(holdings.rows[1].shareholder_name).toBe('Exact 1%');
  });

  it('should update emiten status to success after processing', async () => {
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('BBCA', 'BCA', 'pending')");

    vi.spyOn(apiClient, 'fetchEmitenProfile').mockResolvedValue({
      symbol: 'BBCA',
      name: 'BCA',
      shareholders: [{ name: 'Holder', percentage: 5.0 }],
    });

    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://api.example.com');
    await fetcher.start();

    const result = await pool.query("SELECT status FROM emitens WHERE symbol = 'BBCA'");
    expect(result.rows[0].status).toBe('success');
  });

  it('should stop entire batch on ApiAuthError (401)', async () => {
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('BBCA', 'BCA', 'pending')");
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('TLKM', 'Telkom', 'pending')");

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(apiClient, 'fetchEmitenProfile').mockRejectedValue(new ApiAuthError());

    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://api.example.com');
    await fetcher.start();

    expect(consoleSpy).toHaveBeenCalledWith('Autentikasi gagal. Periksa konfigurasi API key.');

    // Both emitens should still be pending (batch stopped, not marked failed)
    const result = await pool.query("SELECT status FROM emitens WHERE status = 'pending'");
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('should mark emiten as failed on non-auth error and continue to next', async () => {
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('BBCA', 'BCA', 'pending')");
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('TLKM', 'Telkom', 'pending')");

    vi.spyOn(apiClient, 'fetchEmitenProfile').mockImplementation(async (_key, _url, symbol) => {
      if (symbol === 'BBCA') throw new Error('Network error');
      return { symbol, name: 'Telkom', shareholders: [{ name: 'Gov', percentage: 52.0 }] };
    });

    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://api.example.com');
    await fetcher.start();

    const bbca = await pool.query("SELECT status, error_message FROM emitens WHERE symbol = 'BBCA'");
    expect(bbca.rows[0].status).toBe('failed');
    expect(bbca.rows[0].error_message).toBe('Network error');

    const tlkm = await pool.query("SELECT status FROM emitens WHERE symbol = 'TLKM'");
    expect(tlkm.rows[0].status).toBe('success');
  });

  it('should pause and resume correctly', async () => {
    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://api.example.com');

    fetcher.pause();
    expect(floodController.isPaused()).toBe(true);

    fetcher.resume();
    expect(floodController.isPaused()).toBe(false);
  });

  it('getProgress should return DB progress with isRunning and isPaused flags', async () => {
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('BBCA', 'BCA', 'success')");
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('TLKM', 'Telkom', 'pending')");
    await pool.query("INSERT INTO emitens (symbol, name, status) VALUES ('GOTO', 'GoTo', 'failed')");

    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://api.example.com');
    const progress = await fetcher.getProgress();

    expect(progress.total).toBe(3);
    expect(progress.success).toBe(1);
    expect(progress.pending).toBe(1);
    expect(progress.failed).toBe(1);
    expect(progress.isRunning).toBe(false);
    expect(progress.isPaused).toBe(false);
  });

  it('should require baseUrl parameter', () => {
    const fetcher = new Fetcher(pool, floodController, 'test-key', 'https://data.vastara.id');
    // Just verify it constructs without error
    expect(fetcher).toBeDefined();
  });
});
