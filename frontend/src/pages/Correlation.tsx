import { useState } from 'react';
import { getCorrelations, getCommonEmitens } from '../api/client';

interface CorrelationItem {
  shareholderName: string;
  correlationScore: number;
  commonEmitens: string[];
}

interface CommonEmitenItem {
  symbol: string;
  emitenName: string;
  percentage: number;
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

export default function Correlation() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [correlations, setCorrelations] = useState<CorrelationItem[] | null>(null);
  const [searchedName, setSearchedName] = useState('');

  // Detail: common emitens between two shareholders
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [commonEmitens, setCommonEmitens] = useState<CommonEmitenItem[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailWarning, setDetailWarning] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setCorrelations(null);
    setWarning(null);
    setError(null);
    setSelectedName(null);
    setCommonEmitens(null);
    setDetailError(null);
    setDetailWarning(null);
    setLoading(true);
    setSearchedName(name.trim());

    try {
      const result = await getCorrelations(name.trim());
      setCorrelations(result.data);
      if (result.warning) {
        setWarning(result.warning);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch correlations');
    } finally {
      setLoading(false);
    }
  };

  const handleCorrelationClick = async (clickedName: string) => {
    setSelectedName(clickedName);
    setCommonEmitens(null);
    setDetailError(null);
    setDetailWarning(null);
    setDetailLoading(true);

    try {
      const result = await getCommonEmitens(searchedName, clickedName);
      setCommonEmitens(result.data);
      if (result.warning) {
        setDetailWarning(result.warning);
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to fetch common emitens');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Correlation Analysis</h1>
      <div style={{ background: '#f5f5f5', borderRadius: 6, padding: 14, marginBottom: 16, fontSize: 13, color: '#555', lineHeight: 1.6 }}>
        <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#333' }}>Bagaimana cara kerjanya?</p>
        <p style={{ margin: 0 }}>
          Fitur ini mencari pemegang saham lain yang memiliki saham di perusahaan yang sama dengan pemegang saham yang Anda cari.
          Misalnya, jika Anda mencari "GOVERNMENT OF NORWAY" yang memiliki saham di 24 perusahaan, sistem akan mencari siapa saja
          pemegang saham lain yang juga memiliki saham di perusahaan-perusahaan tersebut.
          Skor korelasi menunjukkan jumlah perusahaan yang dimiliki bersama — semakin tinggi skornya,
          semakin banyak kesamaan portofolio antara dua pemegang saham. Klik nama untuk melihat daftar perusahaan yang dimiliki bersama.
        </p>
      </div>

      {/* Search Form */}
      <div style={sectionStyle}>
        <h2>Search Correlations</h2>
        <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center' }}>
          <input
            style={inputStyle}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Shareholder name..."
          />
          <button style={btnStyle} type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Warning */}
      {warning && (
        <div style={warningStyle}>⚠ {warning}</div>
      )}

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {/* Correlations Table */}
      {correlations && (
        <div style={sectionStyle}>
          <h2>Correlations for: {searchedName} ({correlations.length})</h2>
          {correlations.length === 0 ? (
            <p>No correlations found.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Shareholder Name</th>
                  <th style={thStyle}>Correlation Score</th>
                  <th style={thStyle}>Common Emitens</th>
                </tr>
              </thead>
              <tbody>
                {correlations.map((c) => (
                  <tr key={c.shareholderName}>
                    <td
                      style={clickableTd}
                      onClick={() => handleCorrelationClick(c.shareholderName)}
                    >
                      {c.shareholderName}
                    </td>
                    <td style={tdStyle}>{c.correlationScore}</td>
                    <td style={tdStyle}>{c.commonEmitens.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Detail: Common Emitens */}
      {selectedName && (
        <div style={sectionStyle}>
          <h2>Common Emitens: {searchedName} &amp; {selectedName}</h2>
          {detailWarning && (
            <div style={warningStyle}>⚠ {detailWarning}</div>
          )}
          {detailError && <p style={{ color: 'red' }}>Error: {detailError}</p>}
          {detailLoading && <p>Loading...</p>}
          {commonEmitens && (
            commonEmitens.length === 0 ? (
              <p>No common emitens found.</p>
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
                  {commonEmitens.map((em) => (
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
    </div>
  );
}
