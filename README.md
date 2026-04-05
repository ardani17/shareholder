# Shareholder Mapping IDX

Sistem pemetaan hubungan kepemilikan saham di Bursa Efek Indonesia (IDX). Mengambil data profil ~900 emiten dari API Datasaham.io, mengekstrak pemegang saham ≥1%, dan menyediakan analitik (peta kepemilikan, korelasi, network graph, ownership intelligence).

## Quick Start (Development)

Prasyarat: Node.js v18+, PostgreSQL v14+, API Key Datasaham.io

```bash
# 1. Setup database
psql -U postgres -c "CREATE DATABASE shareholder_mapping;"

# 2. Backend
cd backend
cp .env.example .env   # Edit: API key, DB credentials
npm install && npm start

# 3. Frontend (terminal baru)
cd frontend
cp .env.example .env   # Edit: passwords
npm install && npm run dev
```

## Deploy dengan Docker (Recommended)

### Tanpa Domain (HTTP saja, port 80)

```bash
# 1. Clone di VPS
git clone https://github.com/ardani17/shareholder.git
cd shareholder

# 2. Buat .env
cp .env.example .env
nano .env
```

Isi `.env`:
```env
DB_PASSWORD=your_secure_password
DATASAHAM_API_KEY=your_api_key
VITE_SITE_PASSWORD=your_site_password
VITE_DASHBOARD_PASSWORD=your_admin_password
```

```bash
# 3. Jalankan
docker compose up -d --build

# 4. Cek status
docker compose ps
docker compose logs -f backend
```

Akses di `http://your-vps-ip`

### Dengan Domain + HTTPS (SSL otomatis)

```bash
# 1. Arahkan domain ke IP VPS (A record di DNS)
# 2. Clone & setup .env
git clone https://github.com/ardani17/shareholder.git
cd shareholder
cp .env.example .env
nano .env
```

Isi `.env` (tambahkan domain):
```env
DB_PASSWORD=your_secure_password
DATASAHAM_API_KEY=your_api_key
VITE_SITE_PASSWORD=your_site_password
VITE_DASHBOARD_PASSWORD=your_admin_password
DOMAIN=shareholder.yourdomain.com
ACME_EMAIL=your@email.com
```

```bash
# 3. Jalankan dengan production compose
docker compose -f docker-compose.prod.yml up -d --build

# 4. Cek SSL certificate
docker compose -f docker-compose.prod.yml logs traefik
```

Akses di `https://shareholder.yourdomain.com`

SSL certificate dari Let's Encrypt otomatis di-generate dan di-renew.

### Docker Commands

```bash
# Lihat logs
docker compose logs -f backend
docker compose logs -f frontend

# Restart
docker compose restart backend

# Stop semua
docker compose down

# Stop + hapus data (reset database)
docker compose down -v

# Rebuild setelah update code
git pull
docker compose up -d --build
```

## Environment Variables

| Variable | File | Deskripsi |
|----------|------|-----------|
| `DB_PASSWORD` | `.env` (root) | Password PostgreSQL |
| `DATASAHAM_API_KEY` | `.env` (root) / `backend/.env` | API key Datasaham.io |
| `VITE_SITE_PASSWORD` | `.env` (root) / `frontend/.env` | Password masuk aplikasi |
| `VITE_DASHBOARD_PASSWORD` | `.env` (root) / `frontend/.env` | Password admin dashboard |
| `DOMAIN` | `.env` (root) | Domain untuk HTTPS (prod only) |
| `ACME_EMAIL` | `.env` (root) | Email untuk Let's Encrypt (prod only) |
| `PORT` | `backend/.env` | Port backend (default: 3001) |
| `DATABASE_URL` | `backend/.env` | PostgreSQL connection string |

## Setelah Deploy

1. Buka browser → masukkan site password
2. Buka Dashboard → masukkan admin password → klik Start
3. Tunggu ~15-30 menit (tergantung flood control config) untuk fetch ~900 emiten
4. Setelah selesai, gunakan Shareholder Map, Correlations, Network Graph, Intelligence

## API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/status` | Status sistem + lastUpdated |
| POST | `/api/fetch/start` | Mulai batch fetch |
| POST | `/api/fetch/pause` | Pause batch |
| POST | `/api/fetch/resume` | Resume batch |
| GET | `/api/fetch/progress` | Progress fetch |
| GET | `/api/flood-control/config` | Config anti-flooding |
| PUT | `/api/flood-control/config` | Update config |
| GET | `/api/shareholders` | Daftar pemegang saham |
| GET | `/api/shareholders/:name/emitens` | Emiten milik shareholder |
| GET | `/api/emitens/:symbol/shareholders` | Shareholders satu emiten |
| GET | `/api/shareholders/:name/correlations` | Korelasi shareholder |
| GET | `/api/shareholders/:name1/correlations/:name2` | Emiten bersama |
| GET | `/api/graph/nodes` | Graph nodes |
| GET | `/api/graph/edges` | Graph edges |
| GET | `/api/graph/subgraph/:nodeId` | Subgraph satu node |
| GET | `/api/graph/search?q=...` | Search nodes |
| GET | `/api/graph/path?from=...&to=...` | Find path |
| GET | `/api/intelligence/leaderboard` | Top shareholders |
| GET | `/api/intelligence/clusters` | Co-ownership clusters |
| GET | `/api/intelligence/concentration/:symbol` | Concentration score |
| GET | `/api/intelligence/concentrations` | All concentrations |

## Testing

```bash
cd backend && npm test
```
