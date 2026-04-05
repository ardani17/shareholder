# Rencana Implementasi: Shareholder Mapping

## Ringkasan

Implementasi sistem Shareholder Mapping secara bertahap: mulai dari setup project dan data layer, lalu core modules (API Client, FloodController, Fetcher), kemudian analytics services dan API endpoints, dan terakhir frontend Test UI. Setiap tahap divalidasi dengan property-based tests dan unit tests sebelum melanjutkan ke tahap berikutnya.

## Tasks

- [x] 1. Setup project structure, konfigurasi, dan database
  - [x] 1.1 Inisialisasi project backend (Node.js + TypeScript + Express) dan frontend (React + TypeScript + Vite)
    - Buat `backend/package.json` dengan dependencies: express, pg, dotenv, tsx
    - Buat `backend/tsconfig.json` dengan konfigurasi TypeScript strict
    - Buat `frontend/package.json` dengan dependencies: react, react-dom, react-router-dom, d3
    - Buat `frontend/vite.config.ts` dengan proxy ke backend
    - Buat struktur direktori sesuai desain: `backend/src/{database,core,services,controllers}`, `backend/tests/{unit,property}`, `frontend/src/{pages,api,components}`
    - _Requirements: Seluruh persyaratan (setup dasar)_

  - [x] 1.2 Buat shared types dan konfigurasi
    - Buat `backend/src/types.ts` dengan seluruh interface: `EmitenListResponse`, `EmitenProfileResponse`, `FloodControlConfig`, `FloodControlStats`, `FetchProgress`, `ShareholderSummary`, `ShareholderEmiten`, `EmitenShareholder`, `CompletenessMetadata`, `CorrelationResult`, `GraphNode`, `GraphEdge`
    - Buat `backend/src/config.ts` untuk membaca environment variables (`DATASAHAM_API_KEY`, `PORT`, `DATABASE_URL`) dengan default values
    - _Requirements: 8.2_

  - [x] 1.3 Implementasi database connection dan migrations
    - Buat `backend/src/database/connection.ts` untuk setup koneksi PostgreSQL menggunakan `pg` (Pool) dengan connection string dari environment variable `DATABASE_URL`
    - Buat `backend/src/database/migrations.ts` dengan SQL schema: tabel `emitens` (symbol VARCHAR PK, name, status, fetched_at TIMESTAMPTZ, error_message) dan `shareholdings` (id SERIAL PK, emiten_symbol FK, shareholder_name, percentage NUMERIC, fetched_at TIMESTAMPTZ) beserta index
    - _Requirements: 4.1, 4.2_

  - [x] 1.4 Implementasi Emiten Repository
    - Buat `backend/src/database/emiten.repository.ts` dengan method: `insertEmitens()`, `getAll()`, `getByStatus()`, `updateStatus()`, `getProgress()`, `resetStatus()`
    - Method `getProgress()` mengembalikan jumlah emiten per status (success, failed, pending) dan total
    - _Requirements: 1.2, 4.2, 4.3, 4.4_

  - [x] 1.5 Implementasi Shareholding Repository
    - Buat `backend/src/database/shareholding.repository.ts` dengan method: `saveShareholdings()`, `getByEmiten()`, `getByShareholder()`, `getAllShareholders()`, `deleteByEmiten()`, `searchShareholders()`, `searchEmitens()`
    - Method `saveShareholdings()` menghapus data lama dan insert data baru dalam satu transaksi (refresh strategy)
    - _Requirements: 3.3, 4.1, 4.5, 5.1, 5.2, 5.3, 5.5_

  - [ ]* 1.6 Tulis unit tests untuk repositories
    - Test CRUD operations pada `emiten.repository.ts` dan `shareholding.repository.ts`
    - Test constraint `percentage >= 1.0` pada shareholdings
    - Test cascade delete behavior
    - Test `getProgress()` mengembalikan jumlah yang akurat
    - Gunakan PostgreSQL test database untuk testing
    - _Requirements: 4.1, 4.2, 4.4_

- [x] 2. Implementasi core modules: API Client dan Flood Controller
  - [x] 2.1 Implementasi API Client
    - Buat `backend/src/core/api-client.ts` dengan method `fetchEmitenList()` dan `fetchEmitenProfile(symbol)`
    - Sertakan header `x-api-key` pada setiap request ke `https://api.cloudnexify.com`
    - Throw typed errors: `ApiAuthError` (401), `ApiRateLimitError` (429), `ApiError` (lainnya)
    - Timeout per request: 30 detik
    - Validasi response format sebelum mengembalikan data
    - _Requirements: 1.1, 3.1, 8.1, 8.2, 8.3_

  - [x] 2.2 Implementasi Request Queue
    - Buat `backend/src/core/request-queue.ts` dengan FIFO queue
    - Method `enqueue()` mengembalikan Promise yang resolve saat request selesai
    - Method `size()`, `clear()`, `pause()`, `resume()`
    - _Requirements: 2.2_

  - [x] 2.3 Implementasi Flood Controller
    - Buat `backend/src/core/flood-controller.ts` dengan konfigurasi: `delayMs` (default 1000), `maxConcurrency` (default 1), `maxRetries` (default 5), `initialBackoffMs` (default 5000)
    - Implementasi `execute()` yang membungkus request dengan delay, concurrency limiter, dan retry logic
    - Implementasi exponential backoff untuk status 429: delay berlipat ganda (5s, 10s, 20s, 40s, 80s)
    - Implementasi auto-pause saat 3x 429 berturut-turut, reset counter saat request sukses
    - Implementasi `pause()`, `resume()`, `isPaused()`
    - Implementasi `getConfig()`, `updateConfig()`, `getStats()`, `resetStats()`
    - Catat statistik: totalRequests, successCount, failureCount, retryCount, avgResponseTimeMs
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10_

  - [ ]* 2.4 Tulis property test: FIFO Order pada Request Queue (Property 2)
    - **Property 2: FIFO Order pada Request Queue**
    - Untuk kumpulan request yang di-enqueue, verifikasi eksekusi dalam urutan FIFO
    - **Validates: Requirements 2.2**

  - [ ]* 2.5 Tulis property test: Concurrency Limit (Property 3)
    - **Property 3: Concurrency Limit**
    - Untuk konfigurasi concurrency N, verifikasi jumlah request bersamaan tidak melebihi N
    - **Validates: Requirements 2.3**

  - [ ]* 2.6 Tulis property test: Exponential Backoff pada 429 (Property 4)
    - **Property 4: Exponential Backoff pada 429**
    - Untuk urutan response 429, verifikasi delay berlipat ganda dan retry berhenti setelah maxRetries
    - **Validates: Requirements 2.4**

  - [ ]* 2.7 Tulis property test: Pause/Resume Round-Trip (Property 5)
    - **Property 5: Pause/Resume Round-Trip**
    - Verifikasi setelah pause lalu resume, proses melanjutkan dari posisi terakhir tanpa kehilangan progress
    - **Validates: Requirements 2.5, 2.6**

  - [ ]* 2.8 Tulis property test: Auto-Pause pada 3x 429 Berturut-turut (Property 6)
    - **Property 6: Auto-Pause pada 3x 429 Berturut-turut**
    - Verifikasi auto-pause saat 3x 429 berturut-turut dan reset counter saat sukses
    - **Validates: Requirements 2.7**

  - [ ]* 2.9 Tulis property test: Akurasi Statistik Request (Property 7)
    - **Property 7: Akurasi Statistik Request**
    - Untuk urutan hasil request, verifikasi statistik mencerminkan jumlah yang akurat
    - **Validates: Requirements 2.8**

  - [ ]* 2.10 Tulis property test: Konfigurasi Flood Control Round-Trip (Property 8)
    - **Property 8: Konfigurasi Flood Control Round-Trip**
    - Verifikasi updateConfig() lalu getConfig() mengembalikan konfigurasi yang sama
    - **Validates: Requirements 2.10**

- [x] 3. Checkpoint - Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.

- [x] 4. Implementasi Fetcher dan fetch endpoints
  - [x] 4.1 Implementasi Fetcher
    - Buat `backend/src/core/fetcher.ts` sebagai orkestrator batch
    - Method `start()`: ambil daftar emiten dari API (jika belum ada di DB), lalu proses emiten pending/failed melalui FloodController
    - Untuk setiap emiten: ambil profil, filter pemegang saham ≥1%, simpan ke database, update status
    - Tangkap `ApiAuthError` (401) → hentikan seluruh batch dengan pesan "Autentikasi gagal. Periksa konfigurasi API key."
    - Tangkap error lainnya per emiten → tandai `failed`, log error, lanjut ke berikutnya
    - Delegasikan penanganan 429 ke FloodController
    - Method `pause()`, `resume()`, `getProgress()`
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.3, 4.5, 8.3_

  - [x] 4.2 Implementasi Fetch Controller dan routes
    - Buat `backend/src/controllers/fetch.controller.ts` dengan endpoint:
      - `POST /api/fetch/start` — memulai batch fetch
      - `POST /api/fetch/pause` — pause batch
      - `POST /api/fetch/resume` — resume batch
      - `GET /api/fetch/progress` — progress pengambilan data
    - _Requirements: 3.6, 3.7, 3.8, 3.9_

  - [ ]* 4.3 Tulis property test: Persistensi Daftar Emiten (Property 1)
    - **Property 1: Persistensi Daftar Emiten**
    - Untuk daftar emiten dari API, verifikasi seluruh simbol tersimpan di database dengan status `pending`
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 4.4 Tulis property test: Filter Pemegang Saham ≥1% (Property 9)
    - **Property 9: Filter Pemegang Saham ≥1%**
    - Untuk response profil dengan campuran persentase, verifikasi hanya ≥1% yang diekstrak
    - **Validates: Requirements 3.2**

  - [ ]* 4.5 Tulis property test: Persistensi Data Kepemilikan (Property 10)
    - **Property 10: Persistensi Data Kepemilikan**
    - Verifikasi data yang disimpan ke database dapat di-query kembali dengan nilai yang sama
    - **Validates: Requirements 3.3, 4.1**

  - [ ]* 4.6 Tulis property test: Error Handling Lanjut ke Emiten Berikutnya (Property 11)
    - **Property 11: Error Handling Lanjut ke Emiten Berikutnya**
    - Verifikasi emiten error ditandai `failed` dan proses tetap lanjut ke emiten berikutnya
    - **Validates: Requirements 3.4**

  - [ ]* 4.7 Tulis property test: Akurasi Progress Tracking (Property 12)
    - **Property 12: Akurasi Progress Tracking**
    - Verifikasi progress mengembalikan jumlah akurat per kategori dan total benar
    - **Validates: Requirements 4.2, 4.4**

  - [ ]* 4.8 Tulis property test: Re-run Hanya Proses Emiten Belum Selesai (Property 13)
    - **Property 13: Re-run Hanya Proses Emiten Belum Selesai**
    - Verifikasi re-run hanya memproses emiten pending/failed, bukan yang sudah success
    - **Validates: Requirements 4.3**

  - [ ]* 4.9 Tulis property test: Refresh Mengganti Data Lama (Property 14)
    - **Property 14: Refresh Mengganti Data Lama**
    - Verifikasi refresh menghapus data lama dan hanya menyisakan data baru
    - **Validates: Requirements 4.5**

- [x] 5. Checkpoint - Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.

- [x] 6. Implementasi analytics services dan API endpoints
  - [x] 6.1 Implementasi Shareholder Service
    - Buat `backend/src/services/shareholder.service.ts`
    - Method `getAllShareholders(search?)`: daftar pemegang saham unik dengan emitenCount, support pencarian case-insensitive
    - Method `getEmitensByShareholder(name)`: emiten yang dimiliki satu pemegang saham, urut persentase descending
    - Method `getShareholdersByEmiten(symbol)`: pemegang saham satu emiten, urut persentase descending
    - Sertakan metadata `completeness` pada setiap response
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 6.2 Implementasi Correlation Service
    - Buat `backend/src/services/correlation.service.ts`
    - Method `getCorrelations(name)`: pemegang saham lain yang co-own emiten yang sama, skor = jumlah emiten bersama, urut descending
    - Method `getCommonEmitens(name1, name2)`: daftar emiten yang dimiliki bersama
    - Sertakan warning jika data belum lengkap
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.3 Implementasi Graph Service
    - Buat `backend/src/services/graph.service.ts`
    - Method `getNodes(minEmitens?)`: node emiten (`emiten:{symbol}`) dan shareholder (`shareholder:{name}`), size = jumlah koneksi
    - Method `getEdges(minEmitens?)`: edge per record kepemilikan dengan source, target, percentage
    - Method `getSubgraph(nodeId)`: node dan edge yang terhubung langsung dengan satu node
    - Filter `minEmitens` memfilter shareholder dengan minimal N emiten
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 6.4 Implementasi Shareholder Controller dan routes
    - Buat `backend/src/controllers/shareholder.controller.ts` dengan endpoint:
      - `GET /api/shareholders` — daftar semua pemegang saham (support query `search`)
      - `GET /api/shareholders/:name/emitens` — emiten milik satu pemegang saham
      - `GET /api/emitens/:symbol/shareholders` — pemegang saham satu emiten
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 6.5 Implementasi Correlation Controller dan routes
    - Buat `backend/src/controllers/correlation.controller.ts` dengan endpoint:
      - `GET /api/shareholders/:name/correlations` — korelasi satu pemegang saham
      - `GET /api/shareholders/:name1/correlations/:name2` — emiten bersama dua pemegang saham
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.6 Implementasi Graph Controller dan routes
    - Buat `backend/src/controllers/graph.controller.ts` dengan endpoint:
      - `GET /api/graph/nodes` — daftar node (support query `min_emitens`)
      - `GET /api/graph/edges` — daftar edge (support query `min_emitens`)
      - `GET /api/graph/subgraph/:nodeId` — subgraph satu node
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 6.7 Implementasi Flood Config Controller dan Status Controller
    - Buat `backend/src/controllers/flood-config.controller.ts`:
      - `GET /api/flood-control/config` — konfigurasi anti-flooding aktif
      - `PUT /api/flood-control/config` — ubah konfigurasi runtime
    - Buat `backend/src/controllers/status.controller.ts`:
      - `GET /api/status` — status sistem (koneksi DB, status fetch, konfigurasi flood control)
    - _Requirements: 2.9, 2.10, 8.4_

  - [x] 6.8 Wire semua routes ke Express Router
    - Buat `backend/src/index.ts` sebagai entry point: setup Express, register semua routes, inisialisasi database, start server
    - Pastikan semua 16 endpoint terdaftar dan berfungsi
    - _Requirements: Seluruh endpoint backend_

  - [ ]* 6.9 Tulis property test: Daftar Pemegang Saham dengan Jumlah Emiten Benar (Property 15)
    - **Property 15: Daftar Pemegang Saham dengan Jumlah Emiten Benar**
    - Verifikasi emitenCount sesuai jumlah emiten berbeda yang dimiliki
    - **Validates: Requirements 5.1**

  - [ ]* 6.10 Tulis property test: Pengurutan Berdasarkan Persentase Descending (Property 16)
    - **Property 16: Pengurutan Berdasarkan Persentase Descending**
    - Verifikasi hasil terurut dari persentase terbesar ke terkecil
    - **Validates: Requirements 5.4**

  - [ ]* 6.11 Tulis property test: Filter Pencarian (Property 17)
    - **Property 17: Filter Pencarian**
    - Verifikasi hasil pencarian hanya berisi item yang mengandung string pencarian (case-insensitive)
    - **Validates: Requirements 5.5**

  - [ ]* 6.12 Tulis property test: Metadata Completeness (Property 18)
    - **Property 18: Metadata Completeness pada Data Belum Lengkap**
    - Verifikasi metadata completeness disertakan saat data belum lengkap
    - **Validates: Requirements 5.6, 6.5**

  - [ ]* 6.13 Tulis property test: Korelasi Pemegang Saham (Property 19)
    - **Property 19: Korelasi Pemegang Saham**
    - Verifikasi skor korelasi = jumlah emiten bersama, terurut descending
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 6.14 Tulis property test: Emiten Bersama Dua Pemegang Saham (Property 20)
    - **Property 20: Emiten Bersama Dua Pemegang Saham**
    - Verifikasi daftar emiten bersama tepat tanpa terlewat atau berlebih
    - **Validates: Requirements 6.4**

  - [ ]* 6.15 Tulis property test: Graph Nodes dengan Tipe yang Benar (Property 21)
    - **Property 21: Graph Nodes dengan Tipe yang Benar**
    - Verifikasi satu node per emiten dan per shareholder unik, size = jumlah edge
    - **Validates: Requirements 7.1, 7.4**

  - [ ]* 6.16 Tulis property test: Graph Edges Sesuai Data Kepemilikan (Property 22)
    - **Property 22: Graph Edges Sesuai Data Kepemilikan**
    - Verifikasi satu edge per record kepemilikan dengan source, target, persentase benar
    - **Validates: Requirements 7.2**

  - [ ]* 6.17 Tulis property test: Filter min_emitens pada Graph (Property 23)
    - **Property 23: Filter min_emitens pada Graph**
    - Verifikasi filter hanya menyertakan shareholder dengan minimal N emiten
    - **Validates: Requirements 7.3**

  - [ ]* 6.18 Tulis property test: Subgraph Satu Node (Property 24)
    - **Property 24: Subgraph Satu Node**
    - Verifikasi subgraph berisi tepat node dan edge yang terhubung langsung
    - **Validates: Requirements 7.5**

- [x] 7. Checkpoint - Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.


- [x] 8. Implementasi Frontend Test UI
  - [x] 8.1 Setup frontend API client
    - Buat `frontend/src/api/client.ts` sebagai wrapper untuk semua backend API calls
    - Method untuk setiap endpoint: `getStatus()`, `getProgress()`, `startFetch()`, `pauseFetch()`, `resumeFetch()`, `getFloodConfig()`, `updateFloodConfig()`, `getShareholders()`, `getEmitensByShareholder()`, `getShareholdersByEmiten()`, `getCorrelations()`, `getCommonEmitens()`, `getGraphNodes()`, `getGraphEdges()`, `getSubgraph()`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 11.1, 12.1_

  - [x] 8.2 Implementasi halaman Dashboard
    - Buat `frontend/src/pages/Dashboard.tsx`
    - Tampilkan status koneksi backend dari `GET /api/status`
    - Tampilkan progress fetch (success, failed, pending, total)
    - Tombol Start, Pause, Resume untuk kontrol batch
    - Form untuk melihat dan mengubah konfigurasi anti-flooding
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 8.3 Implementasi halaman Shareholder Map
    - Buat `frontend/src/pages/ShareholderMap.tsx`
    - Form pencarian pemegang saham atau emiten
    - Tabel hasil: nama, persentase kepemilikan, jumlah terkait
    - Peringatan jika data belum lengkap berdasarkan metadata completeness
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 8.4 Implementasi halaman Correlation
    - Buat `frontend/src/pages/Correlation.tsx`
    - Form untuk memilih pemegang saham
    - Tabel korelasi: nama terkait, skor korelasi, daftar emiten bersama
    - Peringatan jika data belum lengkap
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 8.5 Implementasi halaman Network Graph
    - Buat `frontend/src/pages/NetworkGraph.tsx` menggunakan D3.js
    - Render Bubble Graph dari data nodes dan edges backend
    - Node emiten dan shareholder dengan warna/bentuk berbeda
    - Ukuran node shareholder proporsional terhadap jumlah emiten
    - Ketebalan edge proporsional terhadap persentase kepemilikan
    - Force-directed layout untuk penyebaran otomatis
    - Interaksi: zoom in/out, pan, klik node untuk highlight subgraph
    - Filter berdasarkan `min_emitens`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [x] 8.6 Wire semua halaman ke App.tsx dengan routing
    - Buat `frontend/src/App.tsx` dengan React Router: Dashboard (/), ShareholderMap (/shareholders), Correlation (/correlations), NetworkGraph (/graph)
    - Navigasi sederhana antar halaman
    - _Requirements: Seluruh persyaratan frontend_

  - [ ]* 8.7 Tulis unit tests untuk komponen frontend
    - Test render Dashboard: status, progress, tombol kontrol
    - Test render ShareholderMap: form pencarian, tabel, peringatan
    - Test render Correlation: form, tabel korelasi, peringatan
    - Test render NetworkGraph: graph render, interaksi
    - Gunakan React Testing Library
    - _Requirements: 9.1-12.8_

- [x] 9. Final checkpoint - Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan ke pengguna jika ada pertanyaan.

## Catatan

- Task bertanda `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan persyaratan spesifik untuk traceability
- Checkpoint memastikan validasi bertahap di setiap fase
- Property tests memvalidasi correctness properties universal (24 properties)
- Unit tests memvalidasi contoh spesifik dan edge cases
- Backend menggunakan TypeScript + Express + PostgreSQL, frontend menggunakan React + TypeScript + Vite + D3.js
- Testing menggunakan Vitest + fast-check + msw + React Testing Library
