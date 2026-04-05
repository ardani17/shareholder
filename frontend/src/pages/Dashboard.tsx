import { useState, useEffect, useCallback } from 'react';
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

  // Free float
  const [ffProgress, setFfProgress] = useState<{ fetched: number; total: number; isRunning: boolean } | null>(null);

  const fetchFfProgress = useCallback(async () => {
    try { setFfProgress(await getFreeFloatProgress()); } catch { /* ignore */ }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getStatus();
      setStatus(data as StatusData);
      setStatusError(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to fetch status');
      setStatus(null);
    }
  }, []);

  const fetchProgress = useCallback(async () => {
    try {
      const data = await getProgress();
      setProgress(data);
      setProgressError(null);
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'Failed to fetch progress');
      setProgress(null);
    }
  }, []);

  const fetchFloodConfig = useCallback(async () => {
    try {
      const data = await getFloodConfig();
      setFloodConfig(data);
      setConfigForm(data);
      setConfigError(null);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to fetch config');
      setFloodConfig(null);
    }
  }, []);

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
      fetchProgress();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Start failed');
    }
  };

  const handleRefreshAll = async () => {
    try {
      await refreshFetch();
      setActionMsg('Force refresh started — semua data akan diperbarui');
      fetchProgress();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Refresh failed');
    }
  };

  const handlePause = async () => {
    try {
      await pauseFetch();
      setActionMsg('Fetch paused');
      fetchProgress();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Pause failed');
    }
  };

  const handleResume = async () => {
    try {
      await resumeFetch();
      setActionMsg('Fetch resumed');
      fetchProgress();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Resume failed');
    }
  };

  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await updateFloodConfig(configForm);
      setFloodConfig(updated);
      setConfigForm(updated);
      setActionMsg('Config updated');
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Config update failed');
    }
  };

  const handleFfFetch = async () => {
    try {
      await startFreeFloatFetch();
      setActionMsg('Free float fetch started');
      fetchFfProgress();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Free float fetch failed');
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
        <div style={{ padding: 8, marginBottom: 12, background: '#e8f5e9', borderRadius: 4 }}>
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
      </div>
    </div>
  );
}
