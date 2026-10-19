# BisnisInsight

Platform analitik penjualan untuk UMKM: multi-tenant, auth/RBAC, import & validasi dataset, 5 kemampuan Machine Learning, dashboard analitik, laporan, dan MCP assistant.

Status: Fase 1–5 selesai. Gate E2E 15 langkah (Prompt §20.5) tersedia sebagai
`apps/backend/test/full-flow.e2e.spec.ts` dan memakai ML service nyata.

## Fitur
- Auth owner/staff/admin, refresh token cookie, tenant isolation (`storeId`).
- Peran **toko** ditegakkan di server: STAFF hanya membaca analitik/laporan dan
  boleh upload data harian + order manual; katalog, ekspor pelanggan, rollback,
  dan analisis ML khusus OWNER.
- Import CSV/Excel → mapping → validasi → commit/rollback + laporan kualitas data.
- CRUD produk/pelanggan/supplier/kategori/margin; input order manual.
- 5 ML: forecasting, segmentasi RFM+K-Means, market basket, churn, anomali.
  Setiap analisis memakai agregat toko yang sedang dipilih, bukan deret global.
- Job ML async di MySQL (`ml_jobs`) + worker `FOR UPDATE SKIP LOCKED`.
- Hasil segmentasi disimpan ke `customers.segment` sehingga ekspor per segmen
  dan dashboard RFM memakai label yang sama.
- Dashboard analitik + chart Recharts: tren penjualan, forecast + interval,
  segmentasi, market basket, churn, dan marker anomali.
- Periode analitik/laporan dihitung relatif terhadap **tanggal transaksi terakhir
  toko**, bukan jam dinding. Dataset historis tetap menampilkan data.
- Laporan HTML/CSV/XLSX multi-sheet + PDF (PDFKit); forecast report memakai
  forecast per produk bila ada, atau hasil ML toko terakhir.
- Notifikasi in-app (`dedupeKey` + cooldown), ekspor pelanggan per segmen (diaudit).
- MCP server stdio (`@rekog/mcp-nest`), tool scoped ke user login.
- Audit log, health check, rate limit, Swagger.

## Prasyarat
- Node.js 24+/26, npm
- MySQL 8.x (Laragon). Database: `bisnis_insight_analytics_db`, test: `bisnis_insight_test`.
- Python 3.x untuk `services/ml`.

## Menjalankan
```powershell
# backend
cd apps\backend
npm install
copy .env.example .env      # isi DATABASE_URL + JWT_SECRET (>=32 char)
npx prisma migrate dev
npm run start:dev           # http://localhost:3000/api/v1

# frontend
cd apps\frontend
npm install
copy .env.example .env.local
npm run dev                 # http://localhost:3001

# ML service (venv disarankan)
cd services\ml
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`pyarrow` wajib ada karena artefak joblib memakai backend Arrow dari pandas.

## Verifikasi
```powershell
cd apps\backend
npm run build; npm run lint; npm test; npm run test:e2e

cd apps\frontend
npm run build; npm run lint; npm test

cd services\ml
.\.venv\Scripts\python -m pytest -q
```

`npm run test:e2e` membutuhkan MySQL di `127.0.0.1:3306` (database
`bisnis_insight_test`) dan ML service di `127.0.0.1:8000`. Test full-flow
mengunggah dataset sintetis 120 hari dan menjalankan forecast + segmentasi nyata.

## MCP
```powershell
cd apps\backend
npm run build
npm run mcp
```
Setiap tool menerima `accessToken` + `storeId` dan memvalidasi keanggotaan toko.

## Dokumentasi
- [Arsitektur](docs/architecture.md)
- [Database design](docs/database-design.md) · [ERD](docs/ERD.md)
- [API specification](docs/api-specification.md)
- [ML pipeline](docs/ml-pipeline.md) · [Dataset analysis](docs/dataset-analysis.md)
- [Authorization matrix](docs/authorization-matrix.md)
- [Development guide](docs/development-guide.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Progress & known gaps](docs/PROGRESS.md)

## Troubleshooting
- CORS: pastikan `CORS_ORIGINS` backend memuat `http://localhost:3001`.
- Access token 15 menit; refresh cookie `bi_rt` Path `/api/v1/auth`.
- `/dashboard` tidak di-prerender (`instant = false`) — disengaja.
- Forecast/kosong: jalankan analisis dari halaman Analisis ML; laporan tidak
  mengarang angka contoh.
- Lihat [docs/troubleshooting.md](docs/troubleshooting.md) untuk detail.
