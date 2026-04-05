import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ShareholderMap from './pages/ShareholderMap';
import Correlation from './pages/Correlation';
import NetworkGraph from './pages/NetworkGraph';
import Intelligence from './pages/Intelligence';
import FreeFloat from './pages/FreeFloat';
import { getStatus } from './api/client';

const SITE_PASSWORD = import.meta.env.VITE_SITE_PASSWORD || 'shareholder2026';

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  padding: '12px 24px',
  background: '#1976d2',
  fontFamily: 'sans-serif',
  alignItems: 'center',
};

const linkStyle: React.CSSProperties = {
  color: '#fff',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 500,
  padding: '4px 8px',
  borderRadius: 4,
};

const bannerStyle: React.CSSProperties = {
  background: '#e3f2fd',
  padding: '6px 24px',
  fontSize: 12,
  color: '#1565c0',
  fontFamily: 'sans-serif',
  borderBottom: '1px solid #bbdefb',
};

function SiteGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('site_unlocked') === '1') setUnlocked(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === SITE_PASSWORD) {
      sessionStorage.setItem('site_unlocked', '1');
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: 360 }}>
        <h2 style={{ margin: '0 0 8px', color: '#1976d2' }}>Shareholder Mapping</h2>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>Masukkan password untuk mengakses aplikasi</p>
        <form onSubmit={handleSubmit}>
          <input type="password" value={input} onChange={e => setInput(e.target.value)} placeholder="Password"
            style={{ padding: 10, width: '100%', borderRadius: 4, border: `1px solid ${error ? '#d32f2f' : '#ccc'}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} autoFocus />
          {error && <p style={{ color: '#d32f2f', fontSize: 12, margin: '0 0 8px' }}>Password salah</p>}
          <button type="submit" style={{ padding: '10px 24px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer', width: '100%' }}>
            Masuk
          </button>
        </form>
      </div>
    </div>
  );
}

function DateBanner() {
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    getStatus().then((data: any) => {
      if (data.lastUpdated) setLastUpdated(data.lastUpdated);
    }).catch(() => {});
  }, []);

  if (!lastUpdated) return null;

  const date = new Date(lastUpdated);
  const formatted = date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return <div style={bannerStyle}>📅 Data terakhir diambil pada: {formatted}</div>;
}

export default function App() {
  return (
    <SiteGate>
      <BrowserRouter>
        <nav style={navStyle}>
          <Link to="/" style={linkStyle}>Dashboard</Link>
          <Link to="/shareholders" style={linkStyle}>Shareholder Map</Link>
          <Link to="/correlations" style={linkStyle}>Correlations</Link>
          <Link to="/graph" style={linkStyle}>Network Graph</Link>
          <Link to="/intelligence" style={linkStyle}>Intelligence</Link>
        <Link to="/freefloat" style={linkStyle}>Free Float</Link>
        </nav>
        <DateBanner />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/shareholders" element={<ShareholderMap />} />
          <Route path="/correlations" element={<Correlation />} />
          <Route path="/graph" element={<NetworkGraph />} />
          <Route path="/intelligence" element={<Intelligence />} />
        <Route path="/freefloat" element={<FreeFloat />} />
        </Routes>
      </BrowserRouter>
    </SiteGate>
  );
}
