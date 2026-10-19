# Progress BisnisInsight

Terakhir diperbarui: 19 Oktober 2026.

## Ringkasan status
| Tahap | Nama | Status |
|---|---|---|
| Phase 1 | Fondasi multi-tenant + auth | Selesai |
| Phase 2 | Modul data (dataset & katalog) | Selesai |
| Phase 3 | Analytics, laporan, forecast | Selesai |
| Phase 4 core | 5 ML + job async + UI ML | Selesai |
| Phase 4 optional | Advanced analytics + admin ML monitoring | Selesai |
| Phase 5 | Laporan XLSX/PDF, notifikasi, MCP, docs | Selesai |
| Tahap 11 | Integrasi, QA, keamanan (E2E 15 langkah) | Selesai — E2E 208/208, migrasi dari nol, backup/restore terverifikasi |
| Tahap 12 | Dokumentasi & deployment final | Dokumentasi selesai; deployment produksi belum |

## Selesai dikerjakan
- Phase 1: fondasi multi-tenant, auth, RBAC, StoreScopeGuard tenant isolation.
- Phase 2: dataset import, mapping, validasi, commit, rollback; CRUD produk,
  pelanggan, supplier, kategori, margin, order manual; laporan kualitas data.
- Phase 3: analytics dashboard, laporan HTML/CSV, forecast, integrasi backend.
- Phase 4: 5 kemampuan ML (forecast, RFM+KMeans, market basket, churn, anomali),
  job async `ml_jobs`, worker `FOR UPDATE SKIP LOCKED`, recovery, ML client,
  dashboard ML, advanced analytics, admin ML monitoring.
- Phase 5: laporan XLSX multi-sheet + PDF, notifikasi in-app, MCP stdio, ekspor
  pelanggan per segmen, dokumentasi.

## Perbaikan & penuntasan (19 Okt 2026)
- **Periode relatif data** (`common/utils/store-window.ts`): semua jendela
  analitik/laporan memakai tanggal transaksi terakhir toko, bukan `new Date()`.
  Dataset historis (mis. 2025 dibuka 2026) tidak lagi menampilkan dashboard kosong.
  Diterapkan di summary, trend, inventory, customer recency, dan laporan.
- **ML per toko** (`ml/ml-data.service.ts`, `ml/ml-client.service.ts`,
  `jobs/ml-job.worker.service.ts`, `services/ml/app/inference/store_runner.py`,
  endpoint `/…/run`): setiap job memakai agregat toko yang dipilih, bukan deret
  global yang tersimpan di artefak.
- **Bug angka nol** (`asNumber`): `$queryRaw` mengembalikan `Decimal`/`bigint`,
  bukan selalu number. Tanpa koersi ini, `SUM(total)` dan `COUNT(*)` terbaca 0
  sehingga forecast gagal “semua nilai penjualan nol”. Ditemukan oleh E2E 15
  langkah dan diperbaiki beserta unit test-nya.
- **Hak akses peran toko**: endpoint tulis memakai `@StoreAccess("OWNER")`,
  bukan hanya `@Roles(...)` platform. Pegawai (`STAFF`) tidak bisa mengubah
  katalog, margin, supplier, pelanggan, rollback dataset, atau mengekspor
  pelanggan; STAFF tetap bisa upload/mapping/validate/commit dataset harian,
  input order manual, dan membaca analitik/laporan. Lihat
  `docs/authorization-matrix.md`.
- **Analisis ML hanya OWNER** dengan validasi `jobType` server-side.
- **Segmentasi disimpan**: label `assignments` dari job segmentasi ditulis ke
  `customers.segment`, sehingga dashboard RFM dan ekspor per segmen konsisten.
- **Laporan forecast** memakai `forecastResults` per produk bila ada; jika tidak,
  memakai hasil job forecast toko terakhir dengan label “Tingkat toko”. Tidak ada
  angka contoh.
- **Visualisasi**: chart Recharts untuk tren, forecast + interval, segmentasi,
  market basket, churn, dan anomali; `job-result-view.tsx` menampilkan tabel,
  matriks evaluasi, penjelasan, dan catatan keterbatasan.
- **Ekspor pelanggan** kini tersedia di halaman Laporan untuk OWNER.
- **Ketahanan worker**: error DB pada tick tidak lagi menjadi unhandled rejection.
- **UI error ML** menampilkan detail validasi dari FastAPI, bukan hanya “422”.

## Verifikasi terakhir (19 Okt 2026)
| Perintah | Hasil |
|---|---|
| `apps/backend` `npm run build` | Pass |
| `apps/backend` `npm test` | Pass — 112/112 |
| `apps/backend` `npm run test:e2e` | Pass — 208/208 (15 file, MySQL nyata) |
| `apps/backend/test/full-flow.e2e.spec.ts` | Pass — alur 15 langkah + ML nyata |
| `apps/backend` `npm run lint` | Pass (tanpa warning) |
| `apps/frontend` `npm run build` | Pass |
| `apps/frontend` `npm run lint` | Pass |
| `apps/frontend` `npm test` | Pass — 108/108 |
| `services/ml` `pytest -q` | Pass — 11/11 |
| `prisma migrate deploy` dari DB kosong | Pass — 5 migrasi (`bisnis_insight_test` & `bisnis_insight_analytics_db`) |
| `mysqldump` + restore ke DB baru | Pass — 22 tabel termasuk `_prisma_migrations` |

Catatan lingkungan: verifikasi ini dijalankan di Windows dengan MariaDB 11.4
portabel (kompatibel MySQL 8) dan ML service nyata di `127.0.0.1:8000`; tidak
ada Docker/Redis. `full-flow.e2e.spec.ts` mengunggah dataset sintetis 120 hari
(2025-01-01 s/d 2025-04-30), mengimpor 120 order, menjalankan forecast 7 hari +
segmentasi, memeriksa dashboard, laporan PDF/HTML, isolasi tenant, batas peran
STAFF, dan monitoring admin.

## Belum dilakukan / diketahui
- **Ekspor laporan terpusat** `GET /reports/:id/download` (dengan path internal
  tersembunyi) tidak diimplementasikan; saat ini tiap tipe laporan punya
  endpoint langsung. Ini pilihan sadar, bukan blocker.
- **Deployment produksi** (Tahap 12): belum ada konfigurasi reverse proxy/HTTPS,
  process manager, rotasi secret, atau CI. Aplikasi sudah terdokumentasi untuk
  setup lokal dalam `README.md` dan `docs/development-guide.md`.
- **`npm audit`** melaporkan 5 temuan high pada pohon dependensi `recharts`;
  perlu ditriase/di-upgrade. Tidak memblokir build/test.
- **Pydantic v2 deprecation**: `services/ml/app/core/config.py` memakai
  class-based `Config`; masih berjalan, sebaiknya pindah ke `ConfigDict`.
- **Backup terjadwal**: dump/restore manual sudah diverifikasi, tetapi belum ada
  scheduler/cron produksi.
- **IDOR sweep** sekarang dibuktikan lewat e2e (STAFF lintas toko → 403), bukan
  script terpisah.
- **Artefak ML** di `services/ml/artifacts/` di-gitignore dan harus
  diregenerasi lewat `python services/ml/training/train_all.py` sebelum menjalankan
  analisis.
