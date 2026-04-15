import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getStatus,
  getProgress,
  startFetch,
  refreshFetch,
  pauseFetch,
  resumeFetch,
  getFloodConfig,
  updateFloodConfig,
  startFreeFloatFetch,
  getFreeFloatProgress,
  getFailedEmitens,
} from '../api/client';

interface StatusData {
  database?: string;
  [key: string]: unknown;
}

interface ProgressData {
  total: number;
  success: number;
  failed: number;
  pending: number;
  isRunning: boolean;
  isPaused: boolean;
}

interface FloodConfig {
  delayMs: number;
  maxConcurrency: number;
  maxRetries: number;
  initialBackoffMs: number;
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  marginRight: 8,
  cursor: 'pointer',
  borderRadius: 4,
  border: '1px solid #888',
  background: '#f0f0f0',
};

const inputStyle: React.CSSProperties = {
  padding: 6,
  marginRight: 8,
  width: 120,
  borderRadius: 4,
  border: '1px solid #aaa',
};

export default function Dashboard() {
  const DASHBOARD_PASSWORD = import.meta.env.VITE_DASHBOARD_PASSWORD || 'admin2026';
  const [dashUnlocked, setDashUnlocked] = useState(() => sessionStorage.getItem('dash_unlocked') === '1');
  const [dashInput, setDashInput] = useState('');
  const [dashError, setDashError] = useState(false);

  const handleDashUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (dashInput === DASHBOARD_PASSWORD) {
      sessionStorage.setItem('dash_unlocked', '1');
      setDashUnlocked(true);
      setDashError(false);
    } else {
      setDashError(true);
    }
  };

  const [status, setStatus] = useState<StatusData | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [floodConfig, setFloodConfig] = useState<FloodConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<FloodConfig>({
    delayMs: 1000,
    maxConcurrency: 1,
    maxRetries: 5,
    initialBackoffMs: 5000,
  });
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Activity log
  const [logs, setLogs] = useState<Array<{ time: string; type: 'info' | 'error' | 'success'; msg: string }>>([]);
  const addLog = useCallback((type: 'info' | 'error' | 'success', msg: string) => {
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [{ time, type, msg }, ...prev].slice(0, 100));
  }, []);

  // Free float
  const [ffProgress, setFfProgress] = useState<{ fetched: number; total: number; isRunning: boolean } | null>(null);

  // Refs to track previous progress for change detection
  const prevProgress = useRef<ProgressData | null>(null);
  const prevFfProgress = useRef<{ fetched: number; total: number; isRunning: boolean } | null>(null);

  // Failed emitens
  const [failedData, setFailedData] = useState<{
    data: Array<{ symbol: string; name: string; error_message: string | null; fetched_at: string | null }>;
    summary: Array<{ error_message: string; cnt: string }>;
    total: number;
  } | null>(null);
  const [showFailed, setShowFailed] = useState(false);

  const fetchFfProgress = useCallback(async () => {
    try {
      const data = await getFreeFloatProgress();
      const prev = prevFfProgress.current;
      if (prev && data.isRunning) {
        if (data.fetched !== prev.fetched) {
          addLog('info', `[Free Float] ${data.fetched}/${data.total} emiten diproses`);
        }
      }
      if (prev?.isRunning && !data.isRunning && data.fetched > 0) {
        addLog('success', `[Free Float] Selesai — ${data.fetched}/${data.total} emiten`);
      }
      prevFfProgress.current = data;
      setFfProgress(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch free float progress';
      addLog('error', `[Free Float] ${msg}`);
    }
  }, [addLog]);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getStatus();
      setStatus(data as StatusData);
      setStatusError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch status';
      setStatusError(msg);
      setStatus(null);
      addLog('error', `Backend status: ${msg}`);
    }
  }, [addLog]);

  const fetchProgress = useCallback(async () => {
    try {
      const data = await getProgress();
      const prev = prevProgress.current;

      if (prev && data.isRunning) {
        // Log when success count changes
        if (data.success !== prev.success || data.failed !== prev.failed) {
          const parts: string[] = [];
          parts.push(`✓${data.success}`);
          if (data.failed > 0) parts.push(`✗${data.failed}`);
          parts.push(`⏳${data.pending}`);
          addLog(
            data.failed > prev.failed ? 'error' : 'info',
            `[Fetch] ${parts.join(' | ')} / ${data.total} total`
          );
        }
      }

      // Detect fetch completed
      if (prev?.isRunning && !data.isRunning) {
        if (data.failed > 0) {
          addLog('error', `[Fetch] Selesai — ${data.success} sukses, ${data.failed} gagal dari ${data.total}`);
        } else if (data.success > 0) {
          addLog('success', `[Fetch] Selesai — ${data.success}/${data.total} sukses`);
        } else {
          addLog('info', `[Fetch] Berhenti`);
        }
      }

      // Detect paused
      if (data.isPaused && prev && !prev.isPaused) {
        addLog('info', `[Fetch] Auto-paused (kemungkinan rate limit)`);
      }

      prevProgress.current = data;
      setProgress(data);
      setProgressError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch progress';
      setProgressError(msg);
      setProgress(null);
      addLog('error', `[Fetch] ${msg}`);
    }
  }, [addLog]);

  const fetchFloodConfig = useCallback(async () => {
    try {
      const data = await getFloodConfig();
      setFloodConfig(data);
      setConfigForm(data);
      setConfigError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch config';
      setConfigError(msg);
      setFloodConfig(null);
      addLog('error', `Flood config: ${msg}`);
    }
  }, [addLog]);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchProgress();
    fetchFloodConfig();
    fetchFfProgress();
  }, [fetchStatus, fetchProgress, fetchFloodConfig, fetchFfProgress]);

  // Auto-refresh progress every 5 seconds when fetch is running
  useEffect(() => {
    if (!progress?.isRunning) return;
    const interval = setInterval(() => { fetchProgress(); }, 5000);
    return () => clearInterval(interval);
  }, [progress?.isRunning, fetchProgress]);

  // Auto-refresh free float progress
  useEffect(() => {
    if (!ffProgress?.isRunning) return;
    const interval = setInterval(() => { fetchFfProgress(); }, 10000);
    return () => clearInterval(interval);
  }, [ffProgress?.isRunning, fetchFfProgress]);

  const handleStart = async () => {
    try {
      await startFetch();
      setActionMsg('Fetch started');
      addLog('success', 'Fetch started');
      fetchProgress();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Start failed';
      setActionMsg(msg);
      addLog('error', `Start fetch: ${msg}`);
    }
  };

  const handleRefreshAll = async () => {
    try {
      await refreshFetch();
      setActionMsg('Force refresh started — semua data akan diperbarui');
      addLog('success', 'Force refresh started');
      fetchProgress();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Refresh failed';
      setActionMsg(msg);
      addLog('error', `Refresh all: ${msg}`);
    }
  };

  const handlePause = async () => {
    try {
      await pauseFetch();
      setActionMsg('Fetch paused');
      addLog('info', 'Fetch paused');
      fetchProgress();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pause failed';
      setActionMsg(msg);
      addLog('error', `Pause: ${msg}`);
    }
  };

  const handleResume = async () => {
    try {
      await resumeFetch();
      setActionMsg('Fetch resumed');
      addLog('info', 'Fetch resumed');
      fetchProgress();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Resume failed';
      setActionMsg(msg);
      addLog('error', `Resume: ${msg}`);
    }
  };

  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await updateFloodConfig(configForm);
      setFloodConfig(updated);
      setConfigForm(updated);
      setActionMsg('Config updated');
      addLog('success', 'Flood config updated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Config update failed';
      setActionMsg(msg);
      addLog('error', `Config update: ${msg}`);
    }
  };

  const handleFfFetch = async () => {
    try {
      await startFreeFloatFetch();
      setActionMsg('Free float fetch started');
      addLog('success', 'Free float fetch started');
      fetchFfProgress();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Free float fetch failed';
      setActionMsg(msg);
      addLog('error', `Free float fetch: ${msg}`);
    }
  };

  const handleConfigChange = (field: keyof FloodConfig, value: string) => {
    const num = Number(value);
    if (!isNaN(num)) {
      setConfigForm((prev) => ({ ...prev, [field]: num }));
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24, fontFamily: 'sans-serif', position: 'relative' }}>
      <h1>Dashboard</h1>

      {/* Dashboard password overlay */}
      {!dashUnlocked && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 80 }}>
          <div style={{ background: '#fff', padding: 32, borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', textAlign: 'center', maxWidth: 320 }}>
            <h3 style={{ margin: '0 0 8px', color: '#1976d2' }}>🔒 Dashboard Terkunci</h3>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>Masukkan password admin untuk mengakses dashboard</p>
            <form onSubmit={handleDashUnlock}>
              <input type="password" value={dashInput} onChange={e => setDashInput(e.target.value)} placeholder="Dashboard password"
                style={{ padding: 8, width: '100%', borderRadius: 4, border: `1px solid ${dashError ? '#d32f2f' : '#ccc'}`, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} autoFocus />
              {dashError && <p style={{ color: '#d32f2f', fontSize: 12, margin: '0 0 8px' }}>Password salah</p>}
              <button type="submit" style={{ padding: '8px 20px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', width: '100%' }}>Unlock</button>
            </form>
          </div>
        </div>
      )}

      <div style={{ filter: dashUnlocked ? 'none' : 'blur(8px)', pointerEvents: dashUnlocked ? 'auto' : 'none', userSelect: dashUnlocked ? 'auto' : 'none' }}>

      {actionMsg && (
        <div style={{
          padding: 8,
          marginBottom: 12,
          background: actionMsg.startsWith('[') || actionMsg.includes('failed') || actionMsg.includes('Tidak bisa') ? '#ffebee' : '#e8f5e9',
          color: actionMsg.startsWith('[') || actionMsg.includes('failed') || actionMsg.includes('Tidak bisa') ? '#c62828' : '#2e7d32',
          borderRadius: 4,
          fontSize: 13,
        }}>
          {actionMsg}
        </div>
      )}

      {/* Backend Status */}
      <div style={sectionStyle}>
        <h2>Backend Status</h2>
        {statusError ? (
          <p style={{ color: 'red' }}>Error: {statusError}</p>
        ) : status ? (
          <p>
            Database:{' '}
            <strong style={{ color: status.database === 'connected' ? 'green' : 'red' }}>
              {status.database === 'connected' ? 'Connected' : 'Disconnected'}
            </strong>
          </p>
        ) : (
          <p>Loading...</p>
        )}
      </div>

      {/* Fetch Progress */}
      <div style={sectionStyle}>
        <h2>Fetch Progress</h2>
        {progressError ? (
          <p style={{ color: 'red' }}>Error: {progressError}</p>
        ) : progress ? (
          <div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ padding: 4 }}>Total</td>
                  <td style={{ padding: 4, fontWeight: 'bold' }}>{progress.total}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4 }}>Success</td>
                  <td style={{ padding: 4, fontWeight: 'bold', color: 'green' }}>{progress.success}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4 }}>Failed</td>
                  <td style={{ padding: 4, fontWeight: 'bold', color: 'red' }}>{progress.failed}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4 }}>Pending</td>
                  <td style={{ padding: 4, fontWeight: 'bold', color: 'orange' }}>{progress.pending}</td>
                </tr>
              </tbody>
            </table>
            <p>
              Status:{' '}
              {progress.isRunning
                ? progress.isPaused
                  ? 'Paused'
                  : 'Running'
                : 'Idle'}
            </p>
          </div>
        ) : (
          <p>Loading...</p>
        )}

        <div style={{ marginTop: 8 }}>
          <button style={btnStyle} onClick={handleStart}>Start</button>
          <button style={{ ...btnStyle, background: '#fff3e0' }} onClick={handleRefreshAll}>🔄 Refresh All</button>
          <button style={btnStyle} onClick={handlePause}>Pause</button>
          <button style={btnStyle} onClick={handleResume}>Resume</button>
        </div>

        {/* Failed emitens detail */}
        {progress && progress.failed > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              style={{ ...btnStyle, fontSize: 12, background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a' }}
              onClick={async () => {
                if (!showFailed) {
                  try {
                    const data = await getFailedEmitens(100);
                    setFailedData(data);
                  } catch { /* ignore */ }
                }
                setShowFailed(!showFailed);
              }}
            >
              {showFailed ? '▼ Sembunyikan' : '▶ Lihat'} {progress.failed} emiten gagal
            </button>
            {showFailed && failedData && (
              <div style={{ marginTop: 8 }}>
                {failedData.summary.length > 0 && (
                  <div style={{ marginBottom: 8, padding: 8, background: '#fff3e0', borderRadius: 4, fontSize: 12 }}>
                    <strong>Ringkasan Error:</strong>
                    {failedData.summary.map((s, i) => (
                      <div key={i} style={{ marginTop: 4 }}>
                        <span style={{ color: '#e65100' }}>{s.cnt}x</span>{' '}
                        <span style={{ fontFamily: 'monospace' }}>{s.error_message || '(no message)'}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 11, fontFamily: 'monospace', background: '#fafafa', borderRadius: 4, padding: 8 }}>
                  {failedData.data.map((e, i) => (
                    <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>
                      <span style={{ fontWeight: 'bold', color: '#c62828' }}>{e.symbol}</span>{' '}
                      <span style={{ color: '#666' }}>{e.error_message || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Flood Control Config */}
      <div style={sectionStyle}>
        <h2>Flood Control Config</h2>
        {configError ? (
          <p style={{ color: 'red' }}>Error: {configError}</p>
        ) : floodConfig ? (
          <div style={{ marginBottom: 12 }}>
            <p>Current: delay={floodConfig.delayMs}ms, concurrency={floodConfig.maxConcurrency}, retries={floodConfig.maxRetries}, backoff={floodConfig.initialBackoffMs}ms</p>
          </div>
        ) : (
          <p>Loading...</p>
        )}

        <form onSubmit={handleConfigSubmit}>
          <div style={{ marginBottom: 8 }}>
            <label>
              Delay (ms):{' '}
              <input
                style={inputStyle}
                type="number"
                value={configForm.delayMs}
                onChange={(e) => handleConfigChange('delayMs', e.target.value)}
              />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              Max Concurrency:{' '}
              <input
                style={inputStyle}
                type="number"
                value={configForm.maxConcurrency}
                onChange={(e) => handleConfigChange('maxConcurrency', e.target.value)}
              />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              Max Retries:{' '}
              <input
                style={inputStyle}
                type="number"
                value={configForm.maxRetries}
                onChange={(e) => handleConfigChange('maxRetries', e.target.value)}
              />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              Initial Backoff (ms):{' '}
              <input
                style={inputStyle}
                type="number"
                value={configForm.initialBackoffMs}
                onChange={(e) => handleConfigChange('initialBackoffMs', e.target.value)}
              />
            </label>
          </div>
          <button style={btnStyle} type="submit">Update Config</button>
        </form>
      </div>

      {/* Free Float Fetch */}
      <div style={sectionStyle}>
        <h2>Free Float Data Fetch</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          Ambil data free float (% FF, jumlah saham FF, jumlah pemegang saham) untuk seluruh emiten.
        </p>
        {ffProgress && (
          <div style={{ marginBottom: 12 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ padding: 4 }}>Fetched</td>
                  <td style={{ padding: 4, fontWeight: 'bold' }}>{ffProgress.fetched}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4 }}>Total Emiten</td>
                  <td style={{ padding: 4, fontWeight: 'bold' }}>{ffProgress.total}</td>
                </tr>
              </tbody>
            </table>
            <p>
              Status:{' '}
              {ffProgress.isRunning
                ? <span style={{ color: 'orange', fontWeight: 'bold' }}>Running ({ffProgress.fetched}/{ffProgress.total})</span>
                : ffProgress.fetched > 0
                  ? <span style={{ color: 'green' }}>Complete</span>
                  : 'Idle'}
            </p>
          </div>
        )}
        <button
          style={{ ...btnStyle, background: ffProgress?.isRunning ? '#ffcdd2' : '#e8f5e9' }}
          onClick={handleFfFetch}
          disabled={ffProgress?.isRunning}
        >
          {ffProgress?.isRunning ? 'Fetching...' : '🔄 Start Free Float Fetch'}
        </button>
      </div>
      {/* Activity Log */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Activity Log</h2>
          {logs.length > 0 && (
            <button style={{ ...btnStyle, fontSize: 12, padding: '4px 10px' }} onClick={() => setLogs([])}>Clear</button>
          )}
        </div>
        {logs.length === 0 ? (
          <p style={{ color: '#999', fontSize: 13 }}>Belum ada aktivitas.</p>
        ) : (
          <div style={{ maxHeight: 250, overflowY: 'auto', fontSize: 12, fontFamily: 'monospace', background: '#fafafa', borderRadius: 4, padding: 8 }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                padding: '3px 0',
                borderBottom: '1px solid #eee',
                color: log.type === 'error' ? '#c62828' : log.type === 'success' ? '#2e7d32' : '#555',
              }}>
                <span style={{ color: '#999', marginRight: 8 }}>{log.time}</span>
                {log.type === 'error' && <span style={{ marginRight: 4 }}>❌</span>}
                {log.type === 'success' && <span style={{ marginRight: 4 }}>✅</span>}
                {log.type === 'info' && <span style={{ marginRight: 4 }}>ℹ️</span>}
                {log.msg}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
