# BisnisInsight — Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup jarak antara implementasi saat ini dan `Promt.md` + `docs/ROADMAP.md`, dimulai dari yang membuat aplikasi benar-benar bisa dipakai (buat toko, navigasi, undangan pegawai), lalu per-store ML, dashboard Recharts, notifikasi, laporan, monitoring admin, dan terakhir QA/E2E.

**Architecture:** Perubahan didominasi frontend Next.js App Router (`apps/frontend/app` + `lib` + `components/dashboard`). Backend NestJS + Prisma menyediakan hampir semua endpoint yang dibutuhkan; gap backend utama adalah inferensi ML per-toko dan ekspor laporan terpusat. ML tetap Python FastAPI, diakses lewat `MlClientService`.

**Tech Stack:** Next.js 16.4 (App Router, cacheComponents), React 19, TypeScript, Vitest + Testing Library, NestJS 12, Prisma 7, MySQL 8, FastAPI, pytest.

**Spec:** `Promt.md` (§5, §6, §7, §13, §15, §16, §20, §21) dan `docs/ROADMAP.md` (Fase 2–5).

## Global Constraints

- Tanpa Docker dan Redis. Cache/queue: tabel `ml_jobs` (MySQL) + worker `setInterval`; cache in-memory sebagai fallback Redis.
- Data tenant WAJIB diambil lewat Client Component yang `fetch` langsung ke NestJS. Dilarang `"use cache"` untuk data tenant (R-7 di `apps/frontend/AGENTS.md`).
- Frontend memakai folder `app/` (bukan `src/`).
- Sebelum menulis kode Next.js, baca panduan versi di `apps/frontend/node_modules/next/dist/docs/` (lihat `apps/frontend/AGENTS.md`).
- Prisma v7: perubahan schema selalu lewat `prisma migrate`; jangan reset DB berisi data.
- RBAC backend adalah penegak sebenarnya; menyembunyikan menu hanya UX. Setiap mutasi tetap lewat `@Roles` + `@StoreAccess`.
- Tidak ada data mock pada jalur inti. Angka contoh di konten publik wajib berlabel "Data contoh" lewat `SampleFigure`.
- Semua ekspor laporan/pelanggan dan aksi sensitif dicatat di `audit_logs`.
- Setiap tahap diakhiri: `npm run build` + test terkait hijau, lalu commit.
- Bahasa UI dan komentar: Indonesia.

## Review Focus

Lima hal yang paling mungkin menggigit pengguna, dan test yang mengikatnya:

1. **Pemilik baru tidak punya toko dan tidak bisa membuatnya dari UI** → dashboard kosong. Test: mendarat di `/dashboard/toko` tanpa toko harus menampilkan form buat toko; submit `POST /stores` membuat toko + membership OWNER.
2. **Pegawai yang menerima undangan tetap melihat menu Pemilik** karena menu memakai platform role. Test: `deriveNavRole` mengembalikan `STAFF` untuk profil yang hanya punya membership STAFF.
3. **Link undangan dibuka tanpa sesi** → harus diarahkan ke `/login?next=...`, lalu kembali ke halaman undangan dan bisa accept. Test: halaman undangan memanggil preview publik, tombol accept muncul hanya saat sesi ada.
4. **Hasil ML per toko sebenarnya berasal dari artefak global**, bukan data toko. Test: setelah inferensi per-toko, hasil forecasstore memakai deret penjualan toko itu (jumlah titik = panjang deret toko).
5. **Chart memanggil backend dengan `storeId` tanpa store switcher** sehingga menampilkan toko pertama, bukan toko yang dipilih, dan tanpa cek membership. Test: helper `resolveActiveStore(profile.stores, activeStoreId)` dan setiap chart memakai storeId hasil resolusi.

---

## Program Map & Urutan

| Sub-plan | Isi | Prasyarat |
|---|---|---|
| 1 | Buat toko + navigasi + role menu | — |
| 2 | Alur undangan pegawai (invite + accept) | 1 |
| 3 | Pengalaman read-only pegawai | 1, 2 |
| 4 | Inferensi ML per-toko | 1 |
| 5 | Dashboard Recharts (tren, forecast, RFM, basket, churn, anomali) | 4 |
| 6 | Notifikasi in-app UI | 1 |
| 7 | Format laporan XLSX/PDF + download terpusat | 1 |
| 8 | Monitoring admin + provisioning ADMIN | 1 |
| 9 | E2E 15 langkah + QA (IDOR, rollback, migrasi dari nol, backup/restore) | 1–8 |
| 10 | Lint bersih + route error boundary | 1 |

**File structure yang disentuh (map):**
- `apps/frontend/lib/dashboard-nav.ts` — aturan menu & role turunan.
- `apps/frontend/lib/dashboard-data.ts` — pemanggil endpoint dashboard (store, member, invitation, notification, report).
- `apps/frontend/components/dashboard/*` — panel & chart baru.
- `apps/frontend/app/(dashboard)/dashboard/**` — halaman baru.
- `apps/frontend/app/invitations/[token]/page.tsx` — halaman accept undangan.
- `apps/frontend/__tests__/*` — test vitest.
- `apps/backend/src/ml/ml-data.service.ts` — pengumpul data per-toko untuk ML.
- `apps/backend/src/ml/ml-client.service.ts` — klien endpoint ML baru.
- `services/ml/app/main.py`, `services/ml/app/inference/runner.py` — endpoint inferensi per-request.
- `apps/backend/scripts/seed-admin.mjs` — provisioning ADMIN.
- `apps/backend/test/full-flow.e2e.spec.ts` — E2E 15 langkah.

---

## Sub-plan 1: Buat Toko + Navigasi + Role Menu

**Kenapa dulu:** tanpa ini, pendaftar baru mendarat di dashboard kosong dan tidak bisa melakukan apa pun.

**Files:**
- Modify: `apps/frontend/lib/dashboard-nav.ts`
- Modify: `apps/frontend/components/dashboard/sidebar.tsx`
- Modify: `apps/frontend/lib/dashboard-data.ts`
- Create: `apps/frontend/components/dashboard/create-store-panel.tsx`
- Modify: `apps/frontend/components/dashboard/stores-panel.tsx`
- Test: `apps/frontend/__tests__/dashboard-nav.test.ts` (extend), `apps/frontend/__tests__/create-store.test.ts` (new)

**Interfaces:**
- Produces: `deriveNavRole(profile: { role: string; stores: readonly { role: string }[] } | null): "ADMIN" | "OWNER" | "STAFF" | null`
- Produces: `createStore(input: { name: string; city?: string }): Promise<StoreView>`
- Produces: `<CreateStorePanel onCreated={() => void} />`

- [ ] **Step 1: Tulis test nav yang gagal**

```ts
// __tests__/dashboard-nav.test.ts (tambahan)
import { deriveNavRole, navForRole } from "@/lib/dashboard-nav";

it("OWNER melihat menu fitur, bukan hanya Profil", () => {
  const hrefs = navForRole("OWNER").map((i) => i.href);
  expect(hrefs).toContain("/dashboard/analytics");
  expect(hrefs).toContain("/dashboard/data");
  expect(hrefs).toContain("/dashboard/reports");
});

it("deriveNavRole: membership STAFF menghasilkan menu STAFF", () => {
  expect(deriveNavRole({ role: "OWNER", stores: [{ role: "STAFF" }] })).toBe("STAFF");
  expect(deriveNavRole({ role: "OWNER", stores: [{ role: "OWNER" }] })).toBe("OWNER");
  expect(deriveNavRole({ role: "ADMIN", stores: [] })).toBe("ADMIN");
  expect(deriveNavRole({ role: "OWNER", stores: [] })).toBe("OWNER");
  expect(deriveNavRole(null)).toBeNull();
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd apps/frontend; npm test -- dashboard-nav`
Expected: FAIL — `deriveNavRole` belum ada; href OWNER belum ada.

- [ ] **Step 3: Implement `deriveNavRole` dan lengkapi menu di `lib/dashboard-nav.ts`**

Aturan: `ADMIN` → ADMIN; ada store dengan `role === "OWNER"` → OWNER; semua store `STAFF` → STAFF; tanpa store → OWNER.

`OWNER_NAV` (urutan): `toko-ringkasan` → `/dashboard/analytics`, `analisis-ml` → `/dashboard/analytics-jobs`, `data` → `/dashboard/data`, `pesanan` → `/dashboard/orders`, `katalog` → `/dashboard/catalog`, `laporan` → `/dashboard/reports`, `toko-dan-tim` → `/dashboard/toko`, `profil` → `/dashboard/profil`.

`STAFF_NAV`: `toko-ringkasan` → `/dashboard/analytics`, `analisis-ml` → `/dashboard/analytics-jobs`, `pesanan` → `/dashboard/orders`, `laporan` → `/dashboard/reports`, `toko` → `/dashboard/toko`, `profil` → `/dashboard/profil`.

- [ ] **Step 4: Ganti pemakaian role di `sidebar.tsx`**

Ganti `const role = toPlatformRole(profile?.role);` menjadi `const role = deriveNavRole(profile);`. `Sidebar` tidak lagi mengimpor `toPlatformRole`.

- [ ] **Step 5: Tambah `createStore` di `lib/dashboard-data.ts`**

```ts
export function createStore(input: { name: string; city?: string }): Promise<StoreView> {
  return sessionRequest<StoreView>("/stores", { method: "POST", body: input });
}
```

- [ ] **Step 6: Tulis test `create-store` yang gagal**

```ts
// __tests__/create-store.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createStore } from "@/lib/dashboard-data";
import * as api from "@/lib/session-refresh";

it("POST /stores dengan body name/city", async () => {
  const spy = vi.spyOn(api, "sessionRequest").mockResolvedValue({ id: "s1", name: "Toko", city: "Bandung", timezone: "Asia/Jakarta", status: "ACTIVE" } as never);
  await createStore({ name: "Toko", city: "Bandung" });
  expect(spy).toHaveBeenCalledWith("/stores", { method: "POST", body: { name: "Toko", city: "Bandung" } });
});
```

- [ ] **Step 7: Implement `CreateStorePanel`** (`components/dashboard/create-store-panel.tsx`, Client Component)

Form `nama` (min 2, max 191) + `kota` (opsional), tombol "Buat toko", status loading/error lewat `describeDataError(toApiError(caught))`, sukses memanggil `onCreated()`.

- [ ] **Step 8: Render panel di `stores-panel.tsx`**

Saat `stores.data.length === 0`, tampilkan `<CreateStorePanel onCreated={stores.reload} />` di dalam `EmptyState` (atau tepat setelahnya).

- [ ] **Step 9: Verifikasi**

Run: `cd apps/frontend; npm test; npm run build`
Expected: PASS semua test, build sukses.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend
git commit -m "feat(frontend): create store + lengkapi navigasi owner/staff"
```

---

## Sub-plan 2: Alur Undangan Pegawai

**Kenapa:** `Promt` §5.3 dan E2E §20.5 langkah 3–4; backend sudah ada, UI belum.

**Files:**
- Modify: `apps/frontend/lib/dashboard-data.ts`
- Create: `apps/frontend/components/dashboard/invite-member-form.tsx`
- Modify: `apps/frontend/components/dashboard/stores-panel.tsx`
- Create: `apps/frontend/app/invitations/[token]/page.tsx`
- Create: `apps/frontend/components/auth/accept-invitation.tsx`
- Test: `apps/frontend/__tests__/invitation-client.test.ts`

**Interfaces:**
- Consumes: `POST /stores/:storeId/invitations` `{email, role: "OWNER"|"STAFF"}` → `{id,email,role,expiresAt,token}`
- Consumes: `GET /invitations/:token` (publik) → `{email, storeName, role, expiresAt}`
- Consumes: `POST /invitations/:token/accept` (auth) → `{storeId, role}`
- Produces: `inviteMember(storeId, input)`, `previewInvitation(token)`, `acceptInvitation(token)`

- [ ] **Step 1: Tulis test klien yang gagal**

```ts
// __tests__/invitation-client.test.ts
import { inviteMember, previewInvitation } from "@/lib/dashboard-data";
import * as api from "@/lib/session-refresh";
import { vi, it, expect } from "vitest";

it("inviteMember mengirim email + role", async () => {
  const spy = vi.spyOn(api, "sessionRequest").mockResolvedValue({} as never);
  await inviteMember("s1", { email: "p@x.id", role: "STAFF" });
  expect(spy).toHaveBeenCalledWith("/stores/s1/invitations", { method: "POST", body: { email: "p@x.id", role: "STAFF" } });
});

it("previewInvitation memakai endpoint publik", async () => {
  const spy = vi.spyOn(api, "sessionRequest").mockResolvedValue({} as never);
  await previewInvitation("tok");
  expect(spy).toHaveBeenCalledWith("/invitations/tok");
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd apps/frontend; npm test -- invitation-client`
Expected: FAIL — fungsi belum ada.

- [ ] **Step 3: Implement ketiga pemanggil di `dashboard-data.ts`** sesuai `Interfaces` di atas.

- [ ] **Step 4: Tulis test komponen `InviteMemberForm` yang gagal**

Render form, isi email, pilih role STAFF, submit; mock `inviteMember`; assert dipanggil dengan `("s1", { email, role: "STAFF" })` dan token hasil ditampilkan sekali.

- [ ] **Step 5: Implement `InviteMemberForm`** (props `{ storeId: string }`), render hanya untuk OWNER toko di `StoreCard` (`canManage`).

- [ ] **Step 6: Buat halaman accept `app/invitations/[token]/page.tsx`**

Server Component tipis tanpa fetch (R-7); merender Client Component `AcceptInvitation token={token}`. `AcceptInvitation`: panggil `previewInvitation` saat mount; kalau `ApiError` `UNAUTHORIZED` saat accept → redirect `/login?next=/invitations/<token>`; sukses → tampilkan store + tombol "Buka dashboard".

- [ ] **Step 7: Verifikasi**

Run: `cd apps/frontend; npm test; npm run build`
Expected: PASS.

- [ ] **Step 8: Verifikasi backend (sudah ada, jangan diubah)**

Run: `cd apps/backend; npx vitest run test/stores.e2e.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend
git commit -m "feat(frontend): undang pegawai + halaman terima undangan"
```

---

## Sub-plan 3: Pengalaman Read-only Pegawai

**Files:**
- Modify: `apps/frontend/lib/dashboard-nav.ts` (helper `canManageStore`)
- Modify: `apps/frontend/components/dashboard/catalog-panel.tsx`, `orders-panel.tsx`, `data-panel.tsx`
- Test: `apps/frontend/__tests__/store-permissions.test.ts`

**Interfaces:**
- Produces: `canManageStore(stores: readonly {id:string; role:string}[], storeId: string | null): boolean` (true hanya bila target store role OWNER).

- [ ] **Step 1: Tulis test `canManageStore`** — STAFF false, OWNER true, storeId null false, store tidak dikenal false.
- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Implement `canManageStore` di `dashboard-nav.ts`.**
- [ ] **Step 4: Gate tombol mutasi** di tiga panel: sembunyikan tombol create/update/hapus saat `!canManageStore(stores, storeId)`; biarkan input order manual tetap terlihat untuk STAFF (`Promt` §5.3 mengizinkan input harian).
- [ ] **Step 5: Verifikasi** `npm test; npm run build`.
- [ ] **Step 6: Commit** `feat(frontend): gate mutasi katalog/data untuk pegawai`.

---

## Sub-plan 4: Inferensi ML Per-Toko (prasyarat chart)

**Masalah:** `apps/backend/src/jobs/ml-job.worker.service.ts` memanggil ML tanpa data toko; ML menginfer dari artefak global. Hasil per-toko jadi tidak berasal dari data toko (`Promt` §13.2).

**Files:**
- Create: `apps/backend/src/ml/ml-data.service.ts`
- Modify: `apps/backend/src/ml/ml-client.service.ts`
- Modify: `apps/backend/src/jobs/ml-job.worker.service.ts`
- Modify: `services/ml/app/main.py`, `services/ml/app/inference/runner.py`
- Create: `services/ml/tests/test_per_store.py`
- Test: `apps/backend/src/ml/ml-data.service.spec.ts`

**Interfaces:**
- Produces (backend→ML): `POST /forecast/run {series:[{date,sales}], horizon_days}`, `POST /segmentation/run {customers:[{customer_id,recency,frequency,monetary}]}`, `POST /basket/run {transactions:[{order_id,product}], top_k}`, `POST /churn/run {customers:[{...features}]}`, `POST /anomaly/run {series:[{date,sales}]}`.
- Produces (NestJS): `MlDataService.forecastInput(storeId)`, `segmentationInput(storeId)`, `basketInput(storeId)`, `churnInput(storeId)`, `anomalyInput(storeId)`.
- ML menerima data, menjalankan model/baseline yang sama seperti training, dan mengembalikan bentuk hasil yang identik dengan sekarang (`forecasts`, `segments`, `rules`, `summary/high_risk_customers`, `anomalies`).

- [ ] **Step 1: Tulis test pytest yang gagal** — `POST /forecast/run` dengan 30 titik → `len(forecasts) == horizon_days`; `POST /anomaly/run` dengan 40 titik → tiap anomali punya `date, actual_sales, baseline, type`.
- [ ] **Step 2: Jalankan** `cd services/ml; python -m pytest -q` → FAIL.
- [ ] **Step 3: Implement endpoint per-request** di `runner.py` + `main.py` (reuse preprocessing yang sama; jangan duplikasi logika training).
- [ ] **Step 4: Jalankan** pytest → PASS.
- [ ] **Step 5: Tulis test `MlDataService`** — dengan Prisma mock, hasil `forecastInput` berupa array berurut tanggal; `segmentationInput` memuat `customer_id`.
- [ ] **Step 6: Implement `MlDataService`** memakai `prisma.orders`/`orderItems`/`customers` ter-scope `storeId`.
- [ ] **Step 7: Ubah worker** agar membangun input per-toko dan memanggil method `MlClientService` baru.
- [ ] **Step 8: Verifikasi** `cd apps/backend; npm test; npm run build` dan `cd services/ml; python -m pytest -q`.
- [ ] **Step 9: Commit** `feat(ml): inferensi per-toko dari data toko`.

---

## Sub-plan 5: Dashboard Recharts

**Prasyarat:** Sub-plan 4 selesai (angka berasal dari data toko).

**Files:**
- Modify: `apps/frontend/package.json` (`recharts`)
- Create: `apps/frontend/components/dashboard/charts/{sales-trend-chart,top-products-chart,forecast-chart,segment-donut,basket-lift-chart,churn-donut,anomaly-scatter}.tsx`
- Modify: `apps/frontend/components/dashboard/analytics-panel.tsx`, `analytics-job-panel.tsx`
- Test: `apps/frontend/__tests__/chart-data.test.ts`

**Interfaces (bentuk hasil ML, sudah pasti):**
- forecast: `{ forecasts: { date, predicted, lower, upper }[] }`
- segmentation: `{ segments: { segment, customers, customer_pct, revenue_pct }[] }`
- basket: `{ rules: { antecedent, consequent, support, confidence, lift }[] }`
- churn: `{ summary: { Low, Medium, High }, high_risk_customers: {...}[] }`
- anomaly: `{ anomalies: { date, actual_sales, baseline, type }[] }`

- [ ] **Step 1: Tulis test pemetaan data yang gagal** — fungsi `toForecastChart(result)`, `toSegmentChart(result)`, `toBasketChart(result)`, `toChurnChart(result)`, `toAnomalyChart(result)` mengembalikan array siap-plot dengan kunci yang benar dan menangani `null`/hasil kosong.
- [ ] **Step 2: Jalankan** `npm test -- chart-data` → FAIL.
- [ ] **Step 3: Implement fungsi pemetaan** (modul murni `lib/chart-data.ts`).
- [ ] **Step 4: Pasang `recharts`** `npm install recharts` dan buat komponen chart (wajib: label, satuan, legenda, tooltip, empty state, `prefers-reduced-motion`).
- [ ] **Step 5: Integrasikan** tren + top products + kategori di `analytics-panel`; hasil per jenis job di `analytics-job-panel`.
- [ ] **Step 6: Verifikasi** `npm test; npm run build`; manual: jalankan analisis → chart tampil dengan angka toko.
- [ ] **Step 7: Commit** `feat(frontend): chart Recharts untuk analytics & hasil ML`.

---

## Sub-plan 6: Notifikasi In-App

**Files:**
- Modify: `apps/frontend/lib/dashboard-data.ts`
- Create: `apps/frontend/components/dashboard/notification-bell.tsx`, `notification-panel.tsx`
- Create: `apps/frontend/app/(dashboard)/dashboard/notifikasi/page.tsx`
- Modify: `apps/frontend/components/dashboard/sidebar.tsx`, `lib/dashboard-nav.ts`
- Test: `apps/frontend/__tests__/notifications.test.ts`

**Interfaces:** `listNotifications({storeId?,status?,limit?,offset?})`, `unreadNotificationCount(storeId?)`, `markNotificationRead(id)`, `markAllNotificationsRead(storeId?)`.

- [ ] **Step 1: Tulis test klien** (path & query benar) → FAIL.
- [ ] **Step 2: Implement pemanggil** di `dashboard-data.ts`.
- [ ] **Step 3: Tulis test `notification-bell`** — badge hanya saat `count > 0`.
- [ ] **Step 4: Implement bell + panel + halaman**, tambah item nav "Notifikasi".
- [ ] **Step 5: Verifikasi** `npm test; npm run build`.
- [ ] **Step 6: Commit** `feat(frontend): pusat notifikasi in-app`.

---

## Sub-plan 7: Format Laporan + Download Terpusat

**Files:**
- Modify: `apps/frontend/components/dashboard/reports-panel.tsx`
- Create: `apps/backend/src/reports/report-export.service.ts` (opsional, lihat Task 7b)
- Modify: `apps/backend/prisma/schema.prisma` (`reportExports`), `apps/backend/src/reports/reports.controller.ts`
- Test: `apps/backend/test/reports.e2e.spec.ts`

**Task 7a — Format selector (endpoint sudah ada):**
- [ ] Step 1: test pemetaan `reportUrl(storeId, type, format, {productId})` → `/stores/:id/reports/{sales-summary|detailed|forecast/:productId}[/{xlsx|pdf}]` → FAIL.
- [ ] Step 2: implement `lib/report-format.ts`.
- [ ] Step 3: tambah pilihan format di `reports-panel` + perbarui kartu "Info Format" (hilangkan teks HTML-only).
- [ ] Step 4: verifikasi `npm test; npm run build`; commit.

**Task 7b — `GET /reports/exports/:id/download` (path internal tidak diekspos):**
- [ ] Step 1: tambah model `reportExports` + `prisma migrate dev --name phase5_report_exports`.
- [ ] Step 2: tulis e2e: `POST /stores/:storeId/reports/exports {type,format}` → `201 {id}` tanpa `filePath`; `GET .../exports/:id/download` → `Content-Disposition` + byte; toko lain → 404.
- [ ] Step 3: implement service (simpan ke `storage/reports/<storeId>/<uuid>.<ext>`), controller, `@StoreAccess` + audit.
- [ ] Step 4: jalankan `npm run test:e2e`; commit.

---

## Sub-plan 8: Monitoring Admin + Provisioning ADMIN

**Files:**
- Modify: `apps/frontend/lib/dashboard-nav.ts`, `components/dashboard/admin-overview-panel.tsx`
- Create: `apps/frontend/app/(dashboard)/dashboard/admin/monitoring/page.tsx`, `components/dashboard/admin-monitoring-panel.tsx`
- Modify: `apps/frontend/lib/dashboard-data.ts` (`listAdminMlJobs`, `mlHealth`)
- Create: `apps/backend/scripts/seed-admin.mjs`
- Modify: `docs/development-guide.md`
- Test: `apps/frontend/__tests__/admin-monitoring.test.ts`

- [ ] **Step 1: test klien** `listAdminMlJobs()` → `/admin/ml-jobs`; `mlHealth()` → `/admin/ml-models` → FAIL.
- [ ] **Step 2:** implement pemanggil.
- [ ] **Step 3:** buat halaman + panel (tabel job, status model, error state); ganti item nav "Monitoring" dari `href: null` → `/dashboard/admin/monitoring`; hapus kartu "belum tersedia" di overview.
- [ ] **Step 4:** buat `seed-admin.mjs` (email+password dari env, `role='ADMIN'`, argon2, idempoten) + dokumentasikan.
- [ ] **Step 5: verifikasi** frontend `npm test; npm run build`; backend `npm run test:e2e`.
- [ ] **Step 6: commit** `feat(admin): monitoring ML + seed admin`.

---

## Sub-plan 9: E2E 15 Langkah + QA

**Files:**
- Create: `apps/backend/test/full-flow.e2e.spec.ts`
- Create: `apps/backend/scripts/migrate-from-zero.ps1`
- Create: `apps/backend/scripts/backup-restore.ps1`
- Modify: `docs/development-guide.md`, `docs/PROGRESS.md`

- [ ] **Step 1:** tulis spec yang menjalankan 15 langkah `Promt` §20.5 secara berurutan dalam satu `it` panjang, dengan assert di tiap langkah (registrasi+login, buat toko, undang pegawai, terima undangan, upload dataset, validasi, commit, jalankan analisis, ML hasil, simpan hasil, dashboard baca hasil, unduh laporan, staff hanya lihat toko sendiri, staff tidak bisa toko lain, admin lihat status).
- [ ] **Step 2:** jalankan `cd apps/backend; npm run test:e2e` (butuh ML service hidup untuk langkah 8–9) → perbaiki sampai PASS.
- [ ] **Step 3:** skrip migrasi dari nol (drop DB test → `prisma migrate deploy` → seed) dan skrip backup/restore (`mysqldump`/`mysql`) + catat hasil di PROGRESS.
- [ ] **Step 4: commit** `test(e2e): alur 15 langkah + skrip QA`.

---

## Sub-plan 10: Lint Bersih + Route Error Boundary

**Files:**
- Modify: `components/dashboard/analytics-job-panel.tsx`, `analytics-panel.tsx`, `catalog-panel.tsx`, `orders-panel.tsx`, `reports-panel.tsx`
- Create: `apps/frontend/app/error.tsx`, `apps/frontend/app/not-found.tsx`, `apps/frontend/app/(dashboard)/error.tsx`
- Test: `apps/frontend/__tests__/error-boundary.test.tsx`

- [ ] **Step 1:** perbaiki 7 error lint (`any` → tipe eksplisit; `loadProducts` dideklarasikan sebelum dipakai; `setState` di effect → pola sesuai rekomendasi `eslint-plugin-react-hooks`).
- [ ] **Step 2:** tambah error boundary yang menampilkan pesan generik + tombol coba lagi (tanpa stack trace).
- [ ] **Step 3: verifikasi** `npm run lint; npm test; npm run build` → 0 error.
- [ ] **Step 4: commit** `chore(frontend): bersihkan lint + error boundary`.

---

## Self-Review

- **Yang sudah pasti dan siap dieksekusi sekarang:** Sub-plan 1, 2, 3, 6, 7a, 8, 10 — semua endpoint backend-nya sudah ada, jadi murni frontend/seed.
- **Butuh backend + ML:** Sub-plan 4 (per-toko), lalu 5 (chart). Ini pekerjaan terbesar dan sebaiknya setelah quick win.
- **Butuh layanan ML hidup:** Sub-plan 5 manual dan Sub-plan 9 langkah 8–9.
- **Risiko:** `reportExports` (7b) menambah migrasi; kerjakan hanya kalau ingin persis `ROADMAP` `GET /reports/:id/download`.

## Execution Handoff

Urutan eksekusi yang disarankan: **1 → 2 → 3 → 6 → 10 → 8 → 7a → 4 → 5 → 7b → 9**.

Untuk eksekusi, pakai `superpowers:executing-plans` (native, satu task sekaligus) atau `superpowers:subagent-driven-development` (subagent per task). Saya rekomendasikan native karena Sub-plan 1–3 saling bergantung pada file `dashboard-nav.ts`/`dashboard-data.ts` yang sama dan lebih murah dikerjakan berurutan.
