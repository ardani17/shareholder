import { useState, useEffect } from 'react';
import { getLeaderboard, getClusters, getAllConcentrations, getConcentration } from '../api/client';

const box: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 6, padding: 16, marginBottom: 16 };
const btn: React.CSSProperties = { padding: '6px 14px', cursor: 'pointer', borderRadius: 4, border: '1px solid #999', background: '#f5f5f5', fontSize: 13, marginRight: 6 };
const th: React.CSSProperties = { borderBottom: '2px solid #333', padding: '8px 10px', textAlign: 'left', background: '#f5f5f5', fontSize: 12 };
const td: React.CSSProperties = { borderBottom: '1px solid #eee', padding: '6px 10px', fontSize: 12 };
const tag: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11 };

type Tab = 'leaderboard' | 'clusters' | 'concentration';

interface LeaderboardItem { name: string; emitenCount: number; totalPercentage: number; avgPercentage: number; topHolding: { symbol: string; percentage: number } | null }
interface ClusterItem { shareholders: string[]; commonEmitens: string[]; strength: number }
interface ConcentrationItem { symbol: string; emitenName: string; score: number; topShareholderPct: number; shareholderCount: number; tier: string }

const tierColors: Record<string, string> = {
  highly_concentrated: '#d32f2f', concentrated: '#f57c00', moderate: '#1976d2', dispersed: '#388e3c',
};

export default function Intelligence() {
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [loading, setLoading] = useState(false);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [lbSort, setLbSort] = useState<'emiten_count' | 'total_percentage'>('emiten_count');

  // Clusters
  const [clusters, setClusters] = useState<ClusterItem[]>([]);
  const [minShared, setMinShared] = useState('3');

  // Concentration
  const [concentrations, setConcentrations] = useState<ConcentrationItem[]>([]);
  const [concSort, setConcSort] = useState<'score' | 'shareholder_count'>('score');
  const [concOrder, setConcOrder] = useState<'desc' | 'asc'>('desc');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [singleConc, setSingleConc] = useState<ConcentrationItem | null>(null);

  const loadLeaderboard = async () => {
    setLoading(true);
    try { setLeaderboard(await getLeaderboard(lbSort, 50)); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const loadClusters = async () => {
    setLoading(true);
    try { setClusters(await getClusters(parseInt(minShared, 10) || 3, 30)); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const loadConcentrations = async () => {
    setLoading(true);
    try { setConcentrations(await getAllConcentrations(concSort, concOrder, 50)); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const searchConcentration = async () => {
    if (!searchSymbol.trim()) return;
    try { setSingleConc(await getConcentration(searchSymbol.toUpperCase())); } catch { setSingleConc(null); }
  };

  useEffect(() => {
    if (tab === 'leaderboard') loadLeaderboard();
    else if (tab === 'clusters') loadClusters();
    else loadConcentrations();
  }, [tab]); // eslint-disable-line

  // Auto-reload when sort changes
  useEffect(() => { if (tab === 'leaderboard') loadLeaderboard(); }, [lbSort]); // eslint-disable-line
  useEffect(() => { if (tab === 'concentration') loadConcentrations(); }, [concSort, concOrder]); // eslint-disable-line

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: 16 }}>Ownership Intelligence</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['leaderboard', 'clusters', 'concentration'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...btn, background: tab === t ? '#1976d2' : '#f5f5f5', color: tab === t ? '#fff' : '#333', border: tab === t ? '1px solid #1976d2' : '1px solid #999' }}>
            {t === 'leaderboard' ? '🏆 Leaderboard' : t === 'clusters' ? '🔗 Clusters' : '📊 Concentration'}
          </button>
        ))}
      </div>

      {loading && <p>Loading...</p>}

      {/* Leaderboard */}
      {tab === 'leaderboard' && !loading && (
        <div style={box}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Sort by:</span>
            <button style={{ ...btn, background: lbSort === 'emiten_count' ? '#e3f2fd' : '#f5f5f5' }}
              onClick={() => { setLbSort('emiten_count'); }}>Emiten Count</button>
            <button style={{ ...btn, background: lbSort === 'total_percentage' ? '#e3f2fd' : '#f5f5f5' }}
              onClick={() => { setLbSort('total_percentage'); }}>Total %</button>
            <button style={btn} onClick={loadLeaderboard}>Refresh</button>
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={th}>#</th><th style={th}>Shareholder</th><th style={th}>Emitens</th>
              <th style={th}>Total %</th><th style={th}>Avg %</th><th style={th}>Top Holding</th>
            </tr></thead>
            <tbody>
              {leaderboard.map((item, i) => (
                <tr key={item.name}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{item.emitenCount}</td>
                  <td style={td}>{item.totalPercentage.toFixed(1)}%</td>
                  <td style={td}>{item.avgPercentage.toFixed(1)}%</td>
                  <td style={td}>{item.topHolding ? `${item.topHolding.symbol} (${item.topHolding.percentage.toFixed(1)}%)` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Clusters */}
      {tab === 'clusters' && !loading && (
        <div style={box}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Min shared emitens:</span>
            <input style={{ padding: 4, width: 60, borderRadius: 4, border: '1px solid #bbb' }} type="number" min={2}
              value={minShared} onChange={e => setMinShared(e.target.value)} />
            <button style={btn} onClick={loadClusters}>Refresh</button>
          </div>
          {clusters.map((c, i) => (
            <div key={i} style={{ padding: 12, marginBottom: 8, background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.shareholders.join(' ↔ ')}</span>
                <span style={{ ...tag, background: '#e8f5e9', color: '#2e7d32' }}>{c.strength} shared</span>
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                Common: {c.commonEmitens.join(', ')}
              </div>
            </div>
          ))}
          {clusters.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>No clusters found with min {minShared} shared emitens</p>}
        </div>
      )}

      {/* Concentration */}
      {tab === 'concentration' && !loading && (
        <div style={box}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input style={{ padding: 6, width: 100, borderRadius: 4, border: '1px solid #bbb' }} placeholder="Symbol..."
              value={searchSymbol} onChange={e => setSearchSymbol(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchConcentration()} />
            <button style={btn} onClick={searchConcentration}>Lookup</button>
            <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
            <button style={{ ...btn, background: concSort === 'score' ? '#e3f2fd' : '#f5f5f5' }}
              onClick={() => { setConcSort('score'); }}>By Score</button>
            <button style={{ ...btn, background: concSort === 'shareholder_count' ? '#e3f2fd' : '#f5f5f5' }}
              onClick={() => { setConcSort('shareholder_count'); }}>By # Shareholders</button>
            <button style={btn} onClick={() => setConcOrder(o => o === 'desc' ? 'asc' : 'desc')}>
              {concOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
            </button>
            <button style={btn} onClick={loadConcentrations}>Refresh</button>
          </div>

          {singleConc && (
            <div style={{ padding: 12, marginBottom: 12, background: '#f3e5f5', borderRadius: 6, border: '1px solid #ce93d8' }}>
              <div style={{ fontWeight: 600 }}>{singleConc.symbol} — {singleConc.emitenName}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Score: <span style={{ fontWeight: 600 }}>{singleConc.score}</span> |
                Top holder: {singleConc.topShareholderPct.toFixed(1)}% |
                Shareholders: {singleConc.shareholderCount} |
                <span style={{ ...tag, marginLeft: 4, background: tierColors[singleConc.tier] || '#999', color: '#fff' }}>
                  {singleConc.tier.replace('_', ' ')}
                </span>
              </div>
            </div>
          )}

          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={th}>Symbol</th><th style={th}>Name</th><th style={th}>Score</th>
              <th style={th}>Top %</th><th style={th}># SH</th><th style={th}>Tier</th>
            </tr></thead>
            <tbody>
              {concentrations.map(c => (
                <tr key={c.symbol}>
                  <td style={{ ...td, fontWeight: 600 }}>{c.symbol}</td>
                  <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.emitenName}</td>
                  <td style={td}>{c.score}</td>
                  <td style={td}>{c.topShareholderPct.toFixed(1)}%</td>
                  <td style={td}>{c.shareholderCount}</td>
                  <td style={td}>
                    <span style={{ ...tag, background: tierColors[c.tier] || '#999', color: '#fff' }}>
                      {c.tier.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
