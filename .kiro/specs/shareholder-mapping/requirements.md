# Dokumen Persyaratan (Requirements Document)

## Pendahuluan

Sistem Shareholder Mapping adalah aplikasi untuk memetakan hubungan kepemilikan saham di Bursa Efek Indonesia (IDX). Sistem ini terdiri dari dua bagian utama:

1. **Backend (Produk Utama)**: Aplikasi backend yang berdiri sendiri (standalone), bertanggung jawab untuk mengambil data pemegang saham dari API Datasaham.io, menyimpan ke database, menyediakan API endpoint untuk analitik (peta kepemilikan, korelasi, dan data graph), serta mengelola mekanisme anti-flooding. Backend dapat digunakan secara independen tanpa frontend.

2. **Frontend (Untuk Testing)**: Antarmuka web sederhana yang digunakan hanya untuk keperluan testing dan verifikasi fungsionalitas backend. Frontend mengonsumsi API endpoint yang disediakan backend.

Fokus utama adalah pengumpulan data secara batch dengan mekanisme anti-flooding, penyimpanan persisten, dan analitik setelah seluruh data terkumpul.

## Glosarium

- **Emiten**: Perusahaan yang sahamnya tercatat dan diperdagangkan di Bursa Efek Indonesia (IDX), total sekitar 900 perusahaan
- **Pemegang_Saham**: Entitas (individu atau institusi) yang memiliki saham suatu Emiten dengan persentase kepemilikan ≥1%
- **API_Client**: Modul backend yang bertanggung jawab melakukan request ke API Datasaham.io (`https://api.cloudnexify.com`)
- **Database**: Penyimpanan persisten untuk data kepemilikan saham seluruh Emiten
- **Fetcher**: Modul backend yang menjalankan proses pengambilan data profil seluruh ~900 Emiten secara batch
- **Request_Queue**: Antrian request pada backend yang mengatur urutan dan kecepatan pengiriman request ke API eksternal
- **Flood_Controller**: Modul backend yang mengelola throttling, concurrency, delay, dan backoff strategy untuk mencegah flooding ke API eksternal
- **Backend_API**: Kumpulan REST API endpoint yang disediakan backend untuk mengakses data dan analitik
- **Peta_Kepemilikan**: Fitur analitik backend yang menunjukkan siapa memiliki saham apa (shareholder mapping)
- **Analisis_Korelasi**: Proses analitik backend untuk menemukan hubungan dan pola antar Pemegang_Saham yang memiliki saham di beberapa Emiten
- **Bubble_Graph**: Data network graph yang menampilkan hubungan antara Pemegang_Saham dan Emiten sebagai node dan edge
- **Node**: Elemen pada Bubble_Graph yang merepresentasikan satu entitas (Emiten atau Pemegang_Saham)
- **Edge**: Penghubung antar Node pada Bubble_Graph yang merepresentasikan hubungan kepemilikan beserta persentasenya
- **Test_UI**: Antarmuka web frontend sederhana yang digunakan hanya untuk testing dan verifikasi fungsionalitas backend

---

## Bagian A: Persyaratan Backend (Produk Utama)

> Backend adalah produk utama yang berdiri sendiri (standalone). Seluruh logika bisnis, pengambilan data, penyimpanan, dan analitik berada di backend. Backend menyediakan REST API endpoint yang dapat dikonsumsi oleh klien manapun.

### Persyaratan 1: Pengambilan Daftar Emiten

**User Story:** Sebagai pengguna backend, saya ingin mendapatkan daftar seluruh emiten yang terdaftar di IDX, sehingga sistem mengetahui emiten mana saja yang perlu diambil data kepemilikannya.

#### Kriteria Penerimaan

1. THE Fetcher SHALL mengambil daftar seluruh Emiten yang terdaftar di IDX dari API Datasaham.io
2. THE Fetcher SHALL menyimpan daftar simbol Emiten ke Database sebagai referensi untuk proses pengambilan data profil
3. IF API mengembalikan error saat mengambil daftar Emiten, THEN THE Fetcher SHALL mencatat error ke log dan menghentikan proses dengan pesan error yang deskriptif

### Persyaratan 2: Mekanisme Anti-Flooding (Flood Control)

**User Story:** Sebagai pengguna backend, saya ingin sistem memiliki mekanisme anti-flooding yang lengkap saat mengambil data dari API eksternal, sehingga proses batch ~900 emiten berjalan stabil tanpa membanjiri API dan tanpa terkena rate limit.

#### Kriteria Penerimaan

1. THE Flood_Controller SHALL menyediakan konfigurasi delay antar request yang dapat diatur oleh pengguna (dalam milidetik), dengan nilai default 1000ms
2. THE Flood_Controller SHALL menggunakan Request_Queue untuk mengantri seluruh request ke API eksternal dan memproses antrian secara berurutan sesuai konfigurasi
3. THE Flood_Controller SHALL menyediakan konfigurasi concurrency (jumlah request paralel maksimum) yang dapat diatur oleh pengguna, dengan nilai default 1 (sequential)
4. THE Flood_Controller SHALL menerapkan exponential backoff strategy WHEN API mengembalikan status 429 (Rate Limited), dimulai dari delay 5 detik dan berlipat ganda pada setiap percobaan ulang hingga maksimal 5 kali percobaan per request
5. THE Flood_Controller SHALL menyediakan fungsi pause untuk menghentikan sementara seluruh proses batch tanpa kehilangan progress yang sudah tercapai
6. THE Flood_Controller SHALL menyediakan fungsi resume untuk melanjutkan proses batch dari posisi terakhir setelah di-pause
7. WHEN jumlah error 429 mencapai 3 kali berturut-turut dalam satu sesi batch, THE Flood_Controller SHALL secara otomatis melakukan pause dan mencatat peringatan ke log
8. THE Flood_Controller SHALL mencatat statistik request ke log: jumlah request berhasil, gagal, di-retry, dan rata-rata waktu response
9. THE Backend_API SHALL menyediakan endpoint `GET /api/flood-control/config` untuk melihat konfigurasi anti-flooding yang sedang aktif
10. THE Backend_API SHALL menyediakan endpoint `PUT /api/flood-control/config` untuk mengubah konfigurasi anti-flooding (delay, concurrency, max retry) saat runtime tanpa restart

### Persyaratan 3: Pengambilan Data Pemegang Saham per Emiten

**User Story:** Sebagai pengguna backend, saya ingin mengambil data pemegang saham (≥1%) dari setiap emiten melalui mekanisme anti-flooding, sehingga saya memiliki data kepemilikan yang lengkap tanpa membanjiri API.

#### Kriteria Penerimaan

1. THE Fetcher SHALL mengambil data profil setiap Emiten dari endpoint `GET /api/emiten/{symbol}/profile` menggunakan header `x-api-key` untuk autentikasi, melalui Request_Queue yang dikelola Flood_Controller
2. WHEN data profil Emiten berhasil diambil, THE Fetcher SHALL mengekstrak hanya data Pemegang_Saham dengan persentase kepemilikan ≥1% dan mengabaikan data lainnya dari response profil
3. THE Fetcher SHALL menyimpan setiap record kepemilikan ke Database dengan informasi: simbol Emiten, nama Pemegang_Saham, dan persentase kepemilikan
4. IF endpoint `/api/emiten/{symbol}/profile` mengembalikan error untuk satu Emiten, THEN THE Fetcher SHALL mencatat error ke log, menandai Emiten tersebut sebagai gagal di Database, dan melanjutkan ke Emiten berikutnya
5. THE Fetcher SHALL mendelegasikan penanganan status 429 (Rate Limited) ke Flood_Controller untuk diproses sesuai backoff strategy
6. THE Backend_API SHALL menyediakan endpoint `GET /api/fetch/progress` untuk melihat progress pengambilan data (jumlah Emiten berhasil, gagal, belum diproses, dan total)
7. THE Backend_API SHALL menyediakan endpoint `POST /api/fetch/start` untuk memulai proses batch pengambilan data
8. THE Backend_API SHALL menyediakan endpoint `POST /api/fetch/pause` untuk menghentikan sementara proses batch
9. THE Backend_API SHALL menyediakan endpoint `POST /api/fetch/resume` untuk melanjutkan proses batch yang di-pause

### Persyaratan 4: Penyimpanan Data Kepemilikan ke Database

**User Story:** Sebagai pengguna backend, saya ingin data kepemilikan saham tersimpan secara persisten di database, sehingga data tidak perlu diambil ulang dari API dan dapat diolah kapan saja.

#### Kriteria Penerimaan

1. THE Database SHALL menyimpan data kepemilikan dengan skema minimal: simbol Emiten, nama Emiten, nama Pemegang_Saham, persentase kepemilikan, dan tanggal pengambilan data
2. THE Database SHALL menyimpan status pengambilan data setiap Emiten (berhasil, gagal, atau belum diproses)
3. WHEN Fetcher menjalankan proses ulang, THE Fetcher SHALL hanya mengambil data Emiten yang belum diproses atau yang sebelumnya gagal, tanpa mengambil ulang data Emiten yang sudah berhasil
4. THE Database SHALL mendukung query untuk menghitung jumlah Emiten yang sudah berhasil diproses dari total seluruh Emiten
5. IF data kepemilikan untuk satu Emiten sudah ada di Database dan pengguna meminta refresh, THEN THE Fetcher SHALL mengganti data lama dengan data baru dari API

### Persyaratan 5: API Endpoint Peta Kepemilikan (Shareholder Mapping)

**User Story:** Sebagai pengguna backend, saya ingin mengakses peta kepemilikan melalui API endpoint, sehingga saya dapat memahami struktur kepemilikan di pasar modal Indonesia dari klien manapun.

#### Kriteria Penerimaan

1. THE Backend_API SHALL menyediakan endpoint `GET /api/shareholders` untuk menampilkan daftar seluruh Pemegang_Saham beserta jumlah Emiten yang dimiliki
2. THE Backend_API SHALL menyediakan endpoint `GET /api/shareholders/{name}/emitens` untuk menampilkan seluruh Emiten yang dimiliki oleh satu Pemegang_Saham beserta persentase kepemilikannya
3. THE Backend_API SHALL menyediakan endpoint `GET /api/emitens/{symbol}/shareholders` untuk menampilkan seluruh Pemegang_Saham dari satu Emiten beserta persentase kepemilikannya
4. THE Backend_API SHALL mengurutkan hasil berdasarkan persentase kepemilikan dari yang terbesar ke terkecil secara default
5. THE Backend_API SHALL mendukung parameter query `search` untuk pencarian berdasarkan nama Pemegang_Saham atau simbol Emiten
6. WHEN data kepemilikan di Database belum lengkap, THE Backend_API SHALL menyertakan metadata `completeness` yang berisi jumlah Emiten berhasil diproses dan total Emiten

### Persyaratan 6: API Endpoint Analisis Korelasi Pemegang Saham

**User Story:** Sebagai pengguna backend, saya ingin mengakses analisis korelasi antar pemegang saham melalui API endpoint, sehingga saya dapat menemukan pola kepemilikan dan grup usaha yang saling terkait.

#### Kriteria Penerimaan

1. THE Backend_API SHALL menyediakan endpoint `GET /api/shareholders/{name}/correlations` untuk menampilkan Pemegang_Saham lain yang memiliki saham di Emiten yang sama (co-ownership)
2. THE Analisis_Korelasi SHALL menghitung jumlah Emiten yang dimiliki bersama oleh dua Pemegang_Saham sebagai skor korelasi
3. THE Backend_API SHALL mengurutkan hasil korelasi berdasarkan skor korelasi dari yang tertinggi ke terendah
4. THE Backend_API SHALL menyediakan endpoint `GET /api/shareholders/{name1}/correlations/{name2}` untuk menampilkan daftar Emiten yang dimiliki bersama oleh dua Pemegang_Saham
5. WHEN data kepemilikan di Database belum lengkap (kurang dari 900 Emiten berhasil diproses), THE Backend_API SHALL menyertakan peringatan dalam response bahwa hasil analisis mungkin tidak lengkap beserta jumlah Emiten yang sudah diproses

### Persyaratan 7: API Endpoint Data Network Graph (Bubble Connecting)

**User Story:** Sebagai pengguna backend, saya ingin mengakses data network graph melalui API endpoint, sehingga klien manapun dapat membangun visualisasi jaringan kepemilikan.

#### Kriteria Penerimaan

1. THE Backend_API SHALL menyediakan endpoint `GET /api/graph/nodes` untuk menampilkan daftar Node (Emiten dan Pemegang_Saham) dengan atribut: id, tipe (emiten/shareholder), label, dan ukuran (jumlah koneksi)
2. THE Backend_API SHALL menyediakan endpoint `GET /api/graph/edges` untuk menampilkan daftar Edge dengan atribut: source node id, target node id, dan persentase kepemilikan
3. THE Backend_API SHALL mendukung parameter query `min_emitens` pada endpoint graph untuk memfilter hanya Pemegang_Saham yang memiliki minimal sejumlah Emiten tertentu (default: 1)
4. THE Backend_API SHALL membedakan tipe Node Emiten dan Node Pemegang_Saham dalam response data
5. THE Backend_API SHALL menyediakan endpoint `GET /api/graph/subgraph/{node_id}` untuk menampilkan Node dan Edge yang terhubung langsung dengan satu Node tertentu

### Persyaratan 8: Autentikasi dan Konfigurasi API

**User Story:** Sebagai sistem backend, saya perlu mengautentikasi setiap request ke API Datasaham.io dan menyediakan konfigurasi yang aman, sehingga proses pengambilan data berjalan stabil.

#### Kriteria Penerimaan

1. THE API_Client SHALL menyertakan header `x-api-key` pada setiap request ke `https://api.cloudnexify.com`
2. THE API_Client SHALL menyimpan API key sebagai environment variable dan tidak meng-hardcode nilai API key dalam source code
3. IF API mengembalikan status 401 (Unauthorized), THEN THE API_Client SHALL menghentikan seluruh proses batch dan menampilkan pesan "Autentikasi gagal. Periksa konfigurasi API key."
4. THE Backend_API SHALL menyediakan endpoint `GET /api/status` untuk melihat status keseluruhan sistem (koneksi database, status fetch, konfigurasi flood control)

---

## Bagian B: Persyaratan Frontend (Untuk Testing)

> Frontend adalah antarmuka web sederhana yang digunakan hanya untuk keperluan testing dan verifikasi fungsionalitas backend. Frontend mengonsumsi REST API endpoint yang disediakan backend dan tidak mengandung logika bisnis.

### Persyaratan 9: Halaman Dashboard Testing

**User Story:** Sebagai tester, saya ingin memiliki halaman dashboard sederhana, sehingga saya dapat memverifikasi status sistem dan progress pengambilan data dari backend.

#### Kriteria Penerimaan

1. THE Test_UI SHALL menampilkan status koneksi backend dengan memanggil endpoint `GET /api/status`
2. THE Test_UI SHALL menampilkan progress pengambilan data (jumlah Emiten berhasil, gagal, belum diproses) dengan memanggil endpoint `GET /api/fetch/progress`
3. THE Test_UI SHALL menyediakan tombol Start, Pause, dan Resume untuk mengontrol proses batch melalui endpoint backend yang sesuai
4. THE Test_UI SHALL menampilkan konfigurasi anti-flooding yang sedang aktif dan menyediakan form untuk mengubah konfigurasi melalui endpoint `PUT /api/flood-control/config`

### Persyaratan 10: Halaman Peta Kepemilikan Testing

**User Story:** Sebagai tester, saya ingin memiliki halaman untuk melihat peta kepemilikan, sehingga saya dapat memverifikasi data shareholder mapping dari backend.

#### Kriteria Penerimaan

1. THE Test_UI SHALL menyediakan form pencarian untuk mencari Pemegang_Saham atau Emiten melalui endpoint backend
2. THE Test_UI SHALL menampilkan hasil pencarian dalam bentuk tabel dengan kolom: nama, persentase kepemilikan, dan jumlah Emiten/Pemegang_Saham terkait
3. THE Test_UI SHALL menampilkan peringatan jika data belum lengkap berdasarkan metadata `completeness` dari response backend

### Persyaratan 11: Halaman Korelasi Testing

**User Story:** Sebagai tester, saya ingin memiliki halaman untuk melihat analisis korelasi, sehingga saya dapat memverifikasi fitur korelasi dari backend.

#### Kriteria Penerimaan

1. THE Test_UI SHALL menyediakan form untuk memilih satu Pemegang_Saham dan menampilkan hasil korelasi dari endpoint backend
2. THE Test_UI SHALL menampilkan daftar korelasi dalam bentuk tabel dengan kolom: nama Pemegang_Saham terkait, skor korelasi, dan daftar Emiten bersama
3. THE Test_UI SHALL menampilkan peringatan jika data belum lengkap berdasarkan response backend

### Persyaratan 12: Halaman Visualisasi Network Graph Testing

**User Story:** Sebagai tester, saya ingin memiliki halaman visualisasi network graph, sehingga saya dapat memverifikasi data graph dari backend secara visual.

#### Kriteria Penerimaan

1. THE Test_UI SHALL menampilkan Bubble_Graph menggunakan data Node dan Edge dari endpoint backend `GET /api/graph/nodes` dan `GET /api/graph/edges`
2. THE Test_UI SHALL menampilkan Node Emiten dan Node Pemegang_Saham dengan bentuk atau warna yang berbeda
3. THE Test_UI SHALL menampilkan Edge dengan ketebalan garis yang proporsional terhadap persentase kepemilikan
4. THE Test_UI SHALL menggunakan ukuran Node Pemegang_Saham yang proporsional terhadap jumlah Emiten yang dimiliki
5. THE Test_UI SHALL mendukung interaksi zoom in, zoom out, dan pan (geser) menggunakan mouse
6. THE Test_UI SHALL menggunakan layout algoritma force-directed agar Node tersebar secara otomatis
7. WHEN pengguna melakukan klik pada satu Node, THE Test_UI SHALL memanggil endpoint `GET /api/graph/subgraph/{node_id}` dan meng-highlight Node serta Edge yang terhubung
8. THE Test_UI SHALL menyediakan filter berdasarkan jumlah minimal kepemilikan Emiten menggunakan parameter `min_emitens` pada endpoint backend
