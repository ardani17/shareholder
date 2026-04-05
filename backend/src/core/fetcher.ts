import pg from 'pg';
import type { FetchProgress } from '../types.js';
import { insertEmitens, getByStatus, updateStatus, getProgress } from '../database/emiten.repository.js';
import { saveShareholdings } from '../database/shareholding.repository.js';
import { fetchEmitenList, fetchEmitenProfile, ApiAuthError } from './api-client.js';
import { FloodController } from './flood-controller.js';

export class Fetcher {
  private _pool: pg.Pool;
  private _floodController: FloodController;
  private _apiKey: string;
  private _baseUrl: string;
  private _isRunning = false;
  private _isPaused = false;

  constructor(
    pool: pg.Pool,
    floodController: FloodController,
    apiKey: string,
    baseUrl: string = 'https://api.cloudnexify.com',
  ) {
    this._pool = pool;
    this._floodController = floodController;
    this._apiKey = apiKey;
    this._baseUrl = baseUrl;
  }

  async start(forceRefresh = false): Promise<void> {
    this._isRunning = true;
    this._isPaused = false;

    try {
      // Step a: Check if emitens exist in DB. If not (or force refresh), fetch and insert.
      const progress = await getProgress(this._pool);
      if (progress.total === 0 || forceRefresh) {
        console.log('Fetching emiten list...');
        const listResponse = await fetchEmitenList(this._apiKey, this._baseUrl);
        console.log(`Found ${listResponse.data.length} emitens. Inserting into database...`);
        await insertEmitens(this._pool, listResponse.data);
      }

      // Step b: Get emitens to process
      let emitensToProcess;
      if (forceRefresh) {
        // Force refresh: reset all to pending, then process ALL
        const { getAll } = await import('../database/emiten.repository.js');
        await this._pool.query("UPDATE emitens SET status = 'pending', fetched_at = NULL, error_message = NULL");
        emitensToProcess = await getAll(this._pool);
        console.log(`Force refresh: reset & processing all ${emitensToProcess.length} emitens...`);
      } else {
        // Normal: only pending/failed
        const pendingEmitens = await getByStatus(this._pool, 'pending');
        const failedEmitens = await getByStatus(this._pool, 'failed');
        emitensToProcess = [...pendingEmitens, ...failedEmitens];
        console.log(`Processing ${emitensToProcess.length} emitens (pending/failed)...`);
      }

      // Step c: Process each emiten through FloodController
      let processed = 0;
      for (const emiten of emitensToProcess) {
        // Step f: If FloodController is paused (auto-pause from 429), stop loop
        if (this._floodController.isPaused()) {
          this._isPaused = true;
          break;
        }

        // Also check if we were manually paused
        if (this._isPaused) {
          break;
        }

        try {
          await this._floodController.execute(async () => {
            // Call fetchEmitenProfile for the emiten
            const profile = await fetchEmitenProfile(this._apiKey, this._baseUrl, emiten.symbol);

            // Profile already returns only shareholders ≥1%
            const shareholders = profile.shareholders;

            // Save to DB
            await saveShareholdings(this._pool, emiten.symbol, shareholders);

            // Update emiten status to 'success'
            await updateStatus(this._pool, emiten.symbol, 'success');

            processed++;
            if (processed % 50 === 0) {
              console.log(`Progress: ${processed}/${emitensToProcess.length} emitens processed`);
            }
          });
        } catch (error) {
          // Step d: If ApiAuthError (401) → stop entire batch
          if (error instanceof ApiAuthError) {
            console.error('Autentikasi gagal. Periksa konfigurasi API key.');
            break;
          }

          // Step e: Other error per emiten → mark as 'failed', continue
          const errorMessage = error instanceof Error ? error.message : String(error);
          await updateStatus(this._pool, emiten.symbol, 'failed', errorMessage);
        }

        // Check again after processing if flood controller auto-paused
        if (this._floodController.isPaused()) {
          this._isPaused = true;
          break;
        }
      }

      console.log(`Batch complete. ${processed} emitens processed successfully.`);
    } finally {
      this._isRunning = false;
    }
  }

  pause(): void {
    this._isPaused = true;
    this._floodController.pause();
  }

  resume(): void {
    this._isPaused = false;
    this._floodController.resume();
  }

  async getProgress(): Promise<FetchProgress> {
    const dbProgress = await getProgress(this._pool);
    return {
      ...dbProgress,
      isRunning: this._isRunning,
      isPaused: this._isPaused,
    };
  }
}
