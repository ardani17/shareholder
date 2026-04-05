import { useState } from 'react';
import {
  getShareholders,
  getEmitensByShareholder,
  getShareholdersByEmiten,
} from '../api/client';

type SearchMode = 'shareholders' | 'emiten';

interface ShareholderSummary {
  name: string;
  emitenCount: number;
}

interface ShareholderEmiten {
  symbol: string;
  emitenName: string;
  percentage: number;
}

interface EmitenShareholder {
  shareholderName: string;
  percentage: number;
}

interface Completeness {
  processedEmitens: number;
  totalEmitens: number;
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
  width: 240,
  borderRadius: 4,
  border: '1px solid #aaa',
};

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  marginTop: 12,
};

const thStyle: React.CSSProperties = {
  borderBottom: '2px solid #333',
  padding: '8px 12px',
  textAlign: 'left',
  background: '#f5f5f5',
};

const tdStyle: React.CSSProperties = {
  borderBottom: '1px solid #ddd',
  padding: '6px 12px',
};

const clickableTd: React.CSSProperties = {
  ...tdStyle,
  color: '#1976d2',
  cursor: 'pointer',
  textDecoration: 'underline',
};

const warningStyle: React.CSSProperties = {
  padding: 10,
  marginBottom: 12,
  background: '#fff3e0',
  border: '1px solid #ffb74d',
  borderRadius: 4,
  color: '#e65100',
};

export default function ShareholderMap() {
  const [mode, setMode] = useState<SearchMode>('shareholders');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completeness, setCompleteness] = useState<Completeness | null>(null);

  // Shareholders search results
  const [shareholders, setShareholders] = useState<ShareholderSummary[] | null>(null);

  // Detail: emitens owned by a selected shareholder
  const [selectedShareholder, setSelectedShareholder] = useState<string | null>(null);
  const [shareholderEmitens, setShareholderEmitens] = useState<ShareholderEmiten[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Emiten search results
  const [emitenShareholders, setEmitenShareholders] = useState<EmitenShareholder[] | null>(null);

  const clearResults = () => {
    setShareholders(null);
    setShareholderEmitens(null);
    setSelectedShareholder(null);
    setEmitenShareholders(null);
    setDetailError(null);
    setError(null);
    setCompleteness(null);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    clearResults();
    setLoading(true);

    try {
      if (mode === 'shareholders') {
        const result = await getShareholders(search || undefined);
        setShareholders(result.data);
        setCompleteness(result.completeness);
      } else {
        const result = await getShareholdersByEmiten(search);
        setEmitenShareholders(result.data);
        setCompleteness(result.completeness);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleShareholderClick = async (name: string) => {
    setSelectedShareholder(name);
    setShareholderEmitens(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const result = await getEmitensByShareholder(name);
      setShareholderEmitens(result.data);
      setCompleteness(result.completeness);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load emitens');
    } finally {
      setDetailLoading(false);
    }
  };

  const isIncomplete = completeness != null &&
    completeness.processedEmitens < completeness.totalEmitens;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Shareholder Map</h1>

      {/* Search Form */}
      <div style={sectionStyle}>
        <h2>Search</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={{ marginRight: 16 }}>
            <input
              type="radio"
              name="searchMode"
              value="shareholders"
              checked={mode === 'shareholders'}
              onChange={() => { setMode('shareholders'); clearResults(); }}
            />{' '}
            Search Shareholders
          </label>
          <label>
            <input
              type="radio"
              name="searchMode"
              value="emiten"
              checked={mode === 'emiten'}
              onChange={() => { setMode('emiten'); clearResults(); }}
            />{' '}
            Search by Emiten
          </label>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center' }}>
          <input
            style={inputStyle}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={mode === 'shareholders' ? 'Shareholder name...' : 'Emiten symbol...'}
          />
          <button style={btnStyle} type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Completeness Warning */}
      {isIncomplete && (
        <div style={warningStyle}>
          ⚠ Data incomplete: {completeness!.processedEmitens} of {completeness!.totalEmitens} emitens processed.
          Results may not reflect the full dataset.
        </div>
      )}

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {/* Shareholders Results Table */}
      {shareholders && (
        <div style={sectionStyle}>
          <h2>Shareholders ({shareholders.length})</h2>
          {shareholders.length === 0 ? (
            <p>No shareholders found.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Emiten Count</th>
                </tr>
              </thead>
              <tbody>
                {shareholders.map((sh) => (
                  <tr key={sh.name}>
                    <td style={clickableTd} onClick={() => handleShareholderClick(sh.name)}>
                      {sh.name}
                    </td>
                    <td style={tdStyle}>{sh.emitenCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Shareholder Detail: Emitens owned */}
      {selectedShareholder && (
        <div style={sectionStyle}>
          <h2>Emitens owned by: {selectedShareholder}</h2>
          {detailError && <p style={{ color: 'red' }}>Error: {detailError}</p>}
          {detailLoading && <p>Loading...</p>}
          {shareholderEmitens && (
            shareholderEmitens.length === 0 ? (
              <p>No emitens found.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Symbol</th>
                    <th style={thStyle}>Emiten Name</th>
                    <th style={thStyle}>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {shareholderEmitens.map((em) => (
                    <tr key={em.symbol}>
                      <td style={tdStyle}>{em.symbol}</td>
                      <td style={tdStyle}>{em.emitenName}</td>
                      <td style={tdStyle}>{em.percentage.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      )}

      {/* Emiten Shareholders Results Table */}
      {emitenShareholders && (
        <div style={sectionStyle}>
          <h2>Shareholders of: {search}</h2>
          {emitenShareholders.length === 0 ? (
            <p>No shareholders found.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Shareholder Name</th>
                  <th style={thStyle}>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {emitenShareholders.map((sh) => (
                  <tr key={sh.shareholderName}>
                    <td style={tdStyle}>{sh.shareholderName}</td>
                    <td style={tdStyle}>{sh.percentage.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
