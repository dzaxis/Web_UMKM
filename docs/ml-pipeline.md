# ML Pipeline

1. Upload dataset (CSV/Excel) -> mapping -> validasi -> commit.
2. Data quality gate: kolom wajib, tipe angka/tanggal, duplikat, join pelanggan/produk,
   dan status order yang dikecualikan (`CANCELLED`, `CANCELED`, `REFUNDED`).
3. Artefak model global ditraining terpisah di `services/ml/training/`:
   forecasting, segmentasi RFM+KMeans, market basket, churn, anomaly.
4. OWNER memilih toko lalu menjalankan analisis. Backend membuat baris `ml_jobs`
   (`queued`) setelah memvalidasi `jobType`.
5. Worker backend mengambil job dengan `FOR UPDATE SKIP LOCKED`, menyusun agregat
   **hanya untuk toko itu**, lalu memanggil FastAPI:
   - `POST /forecast/run`
   - `POST /segmentation/run`
   - `POST /basket/run`
   - `POST /churn/run`
   - `POST /anomaly/run`
6. FastAPI menghitung hasil dari data yang dikirim (bukan deret global yang
   tersimpan di artefak) dan mengembalikan JSON yang aman (`inf`/`NaN` -> `null`).
7. NestJS menyimpan hasil ke `ml_jobs.result`, menulis `forecastResults` bila ada,
   menyimpan label segmentasi ke `customers.segment`, lalu invalidasi cache toko.
8. UI melakukan polling status job dan merender chart/tabel dari hasil tersimpan.

## Sumber data per toko

- `orders` + `orderItems` difilter `storeId` dan status yang dikecualikan.
- Deret harian diisi hari tanpa transaksi dengan nol agar pola mingguan benar.
- Recency/tenure pelanggan memakai tanggal transaksi terakhir toko + 1 hari,
  bukan jam dinding. Dataset historis tetap menghasilkan fitur yang bermakna.
- Tidak ada hasil mock: jika data tidak cukup, job gagal dengan pesan yang
  menjelaskan minimal data yang dibutuhkan.

## Model dan fallback

- Forecasting: seasonal naive; Holt-Winters hanya dipakai bila WAPE holdout
  lebih baik minimal 2%. Interval melebar mengikuti akar horizon.
- Segmentasi: RFM + StandardScaler + KMeans; `k` dipilih dari silhouette.
  Label segmen ditentukan dari profil cluster, bukan nomor cluster.
- Market basket: FP-Growth dengan threshold yang disesuaikan; `conviction`
  tak hingga dikirim sebagai `null`.
- Churn: model global diterapkan ke fitur toko; risiko Low/Medium/High.
- Anomali: Isolation Forest + robust z-score pada deret toko.

## Keterbatasan

- Kualitas hasil bergantung pada panjang dan kualitas histori toko.
- Model global (churn) tidak dilatih ulang per toko; ini inference, bukan training.
- Training ulang model global harus dijalankan eksplisit, bukan dari dashboard.
