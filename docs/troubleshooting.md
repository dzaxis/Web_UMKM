# Troubleshooting

- MySQL connection refused: cek service MySQL/MariaDB, `DATABASE_URL` (default
  `mysql://root@127.0.0.1:3306/...`), dan port `3306` bebas.
- Test DB belum bermigrasi: dari `apps/backend` jalankan
  `$env:DATABASE_URL="mysql://root@127.0.0.1:3306/bisnis_insight_test"; npx prisma migrate deploy`.
- e2e gagal di langkah analisis: pastikan ML service jalan di `ML_SERVICE_URL`
  dan artefak model ada. `npm run test:e2e` memakai ML nyata, bukan mock.
- FastAPI model artifact missing: jalankan `python services/ml/training/train_all.py`
  atau `POST /train`.
- Job ML gagal “422 … semua nilai penjualan nol”: biasanya kolom `orders.total`
  benar-benar kosong atau agregat terbaca 0. Pesan detail dari FastAPI ikut
  ditampilkan di `ml_jobs.errorMessage`.
- Job tetap queued: worker backend tick setiap 5s; pastikan FastAPI healthy
  (`GET /health`).
- Forecast/laporan kosong: jalankan analisis dari halaman Analisis ML. Laporan
  menampilkan pesan eksplisit, tidak mengarang angka.
- MCP hang stdio: pastikan tidak ada `console.log` ke stdout selain protokol MCP.
- Redis: fallback in-memory jika tanpa Redis; warning normal.
