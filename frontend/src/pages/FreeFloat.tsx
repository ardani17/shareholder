import { useState, useEffect, useCallback } from 'react';
import { getFreeFloatProgress, getFreeFloatData } from '../api/client';

interface FFRow {
  symbol: string; emiten_name: string; free_float_pct: number | null;
  share_outstanding: number | null; free_float_shares: number | null;
  shareholder_count: number | null; shareholder_date: string | null;
  board: string | null; compliance_status: string; fetched_at: string;
}

const box: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 6, padding: 12, marginBottom: 12 };
const btn: React.CSSProperties = { padding: '6px 14px', cursor: 'pointer', borderRadius: 4, border: '1px solid #999', background: '#f5f5f5', fontSize: 13, marginRight: 6 };
const inp: React.CSSProperties = { padding: 6, borderRadius: 4, border: '1px solid #bbb', fontSize: 13 };
const th: React.CSSProperties = { borderBottom: '2px solid #c62828', padding: '8px 6px', textAlign: 'left', background: '#ffebee', fontSize: 11, color: '#b71c1c', fontWeight: 700 };
const td: React.CSSProperties = { borderBottom: '1px solid #eee', padding: '6px', fontSize: 12 };

function fmt(n: number | null): string {
  if (n == null) return '-';
  return n.toLocaleString('id-ID');
}

function fmtPct(n: number | null): string {
  if (n == null) return '-';
  return `${n.toFixed(2)}%`;
}

const statusColors: Record<string, { bg: string; color: string; label: string }> = {
  memenuhi: { bg: '#e8f5e9', color: '#2e7d32', label: 'Memenuhi' },
  tidak_memenuhi: { bg: '#ffebee', color: '#c62828', label: 'Tidak Memenuhi' },
  unknown: { bg: '#f5f5f5', color: '#999', label: 'N/A' },
};

export default function FreeFloat() {
  const [data, setData] = useState<FFRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ fetched: number; total: number; isRunning: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('symbol');
  const [order, setOrder] = useState('asc');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getFreeFloatData({ status: statusFilter || undefined, search: search || undefined, sort_by: sortBy, order });
      setData(d);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [search, statusFilter, sortBy, order]);

  const loadProgress = async () => {
    try { setProgress(await getFreeFloatProgress()); } catch { /* ignore */ }
  };

  useEffect(() => { loadData(); loadProgress(); }, []); // eslint-disable-line

  useEffect(() => {
    if (!progress?.isRunning) return;
    const iv = setInterval(() => { loadProgress(); loadData(); }, 10000);
    return () => clearInterval(iv);
  }, [progress?.isRunning]); // eslint-disable-line

  const toggleSort = (col: string) => {
    if (sortBy === col) setOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setOrder('asc'); }
  };

  const memenuhi = data.filter(d => d.compliance_status === 'memenuhi').length;
  const tidakMemenuhi = data.filter(d => d.compliance_status === 'tidak_memenuhi').length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#b71c1c', marginBottom: 4 }}>Laporan Free Float Monitor</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>Data diambil dari API Datasaham.io — mirip format Laporan Bulanan Registrasi Kepemilikan Saham BEI</p>

      {/* Controls */}
      <div style={{ ...box, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {progress && <span style={{ fontSize: 12, color: '#666' }}>
          {progress.isRunning
            ? `⏳ Sedang mengambil data... (${progress.fetched}/${progress.total})`
            : `📊 Data: ${progress.fetched}/${progress.total} emiten`}
        </span>}
        <span style={{ flex: 1 }} />
        <input style={{ ...inp, width: 180 }} placeholder="Cari symbol/nama..." value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadData()} />
        <select style={inp} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); }}>
          <option value="">Semua Status</option>
          <option value="memenuhi">Memenuhi</option>
          <option value="tidak_memenuhi">Tidak Memenuhi</option>
          <option value="unknown">N/A</option>
        </select>
        <button style={btn} onClick={loadData}>Filter</button>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ ...box, flex: 1, textAlign: 'center', background: '#e8f5e9' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#2e7d32' }}>{memenuhi}</div>
          <div style={{ fontSize: 11, color: '#666' }}>Memenuhi</div>
        </div>
        <div style={{ ...box, flex: 1, textAlign: 'center', background: '#ffebee' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#c62828' }}>{tidakMemenuhi}</div>
          <div style={{ fontSize: 11, color: '#666' }}>Tidak Memenuhi</div>
        </div>
        <div style={{ ...box, flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{data.length}</div>
          <div style={{ fontSize: 11, color: '#666' }}>Total Ditampilkan</div>
        </div>
      </div>

      {loading && <p>Loading...</p>}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={th}>No.</th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('symbol')}>Kode {sortBy === 'symbol' ? (order === 'asc' ? '↑' : '↓') : ''}</th>
              <th style={th}>Nama Perusahaan</th>
              <th style={th}>Papan</th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('free_float_pct')}>% Free Float {sortBy === 'free_float_pct' ? (order === 'asc' ? '↑' : '↓') : ''}</th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('free_float_shares')}>Jumlah Saham FF {sortBy === 'free_float_shares' ? (order === 'asc' ? '↑' : '↓') : ''}</th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('shareholder_count')}>Jumlah Pemegang Saham {sortBy === 'shareholder_count' ? (order === 'asc' ? '↑' : '↓') : ''}</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const st = statusColors[row.compliance_status] || statusColors.unknown;
              return (
                <tr key={row.symbol} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{row.symbol}</td>
                  <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.emiten_name}</td>
                  <td style={{ ...td, fontSize: 11 }}>{row.board || '-'}</td>
                  <td style={{ ...td, fontWeight: 600, color: (row.free_float_pct ?? 0) < 7.5 ? '#c62828' : '#2e7d32' }}>{fmtPct(row.free_float_pct)}</td>
                  <td style={td}>{fmt(row.free_float_shares)}</td>
                  <td style={{ ...td, fontWeight: 600, color: (row.shareholder_count ?? 0) < 300 ? '#c62828' : '#2e7d32' }}>{fmt(row.shareholder_count)}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, background: st.bg, color: st.color, fontWeight: 600 }}>
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.length === 0 && !loading && (
        <p style={{ textAlign: 'center', color: '#999', padding: 24 }}>
          Belum ada data. Buka Dashboard dan klik "Start Free Float Fetch" untuk mengambil data.
        </p>
      )}
    </div>
  );
}
