import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaService } from "../src/database/prisma.service.js";
import { buildTestApp } from "./utils/test-app.js";

/**
 * Alur end-to-end 15 langkah (Promt §20.5).
 *
 * Test ini TIDAK memakai mock ML. Kalau `services/ml` tidak berjalan di
 * `ML_SERVICE_URL` (default 127.0.0.1:8000), langkah analisis akan gagal
 * dengan pesan yang jelas - bukan diam-diam diganti hasil palsu.
 *
 * Dataset yang diunggah di-generate di sini (bukan file statis) supaya punya
 * cukup histori untuk forecasting dan cukup pelanggan untuk segmentasi.
 */
const VALID_PASSWORD = "rahasia-kuat-123";
let app: INestApplication;
let prisma: PrismaService;
let csvPath: string | null = null;

async function resetDatabase() {
  // Urutan mengikuti foreign key: anak dulu, baru induk. Jangan mengandalkan
  // database test yang "kebetulan kosong" - file e2e lain bisa meninggalkan
  // supplier/margin/refresh token yang membuat delete ini gagal.
  await prisma.mlJobs.deleteMany({});
  await prisma.forecastResults.deleteMany({});
  await prisma.notifications.deleteMany({});
  await prisma.auditLogs.deleteMany({});
  await prisma.orderItems.deleteMany({});
  await prisma.orders.deleteMany({});
  await prisma.productPrices.deleteMany({});
  await prisma.productMargins.deleteMany({});
  await prisma.productSuppliers.deleteMany({});
  await prisma.products.deleteMany({});
  await prisma.productCategories.deleteMany({});
  await prisma.suppliers.deleteMany({});
  await prisma.customers.deleteMany({});
  await prisma.datasetIssues.deleteMany({});
  await prisma.datasetMappings.deleteMany({});
  await prisma.datasets.deleteMany({});
  await prisma.refreshTokens.deleteMany({});
  await prisma.storeInvites.deleteMany({});
  await prisma.storeMembers.deleteMany({});
  await prisma.stores.deleteMany({});
  await prisma.users.deleteMany({});
}

beforeAll(async () => {
  app = await buildTestApp();
  prisma = app.get(PrismaService);
}, 60_000);

beforeEach(async () => {
  await resetDatabase();
}, 60_000);

afterAll(async () => {
  await resetDatabase();
  await app.close();
  if (csvPath && fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
}, 60_000);

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

async function register(email: string, name: string): Promise<void> {
  await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({ email, name, password: VALID_PASSWORD })
    .expect(201);
}

async function login(email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password: VALID_PASSWORD })
    .expect(201);
  return res.body.data.accessToken as string;
}

function auth(token: string): [string, string] {
  return ["Authorization", `Bearer ${token}`];
}

/**
 * 120 hari transaksi, 15 pelanggan, 8 produk. Setiap order berisi P1+P2
 * (supaya market basket punya pola nyata) dan satu produk bergilir.
 */
function writeDataset(): string {
  const file = path.join(os.tmpdir(), `bisnis-insight-flow-${randomUUID()}.csv`);
  const lines = [
    "order_id,order_date,customer_code,customer_name,product_code,product_name,category,qty,unit,unit_price,total_price,channel",
  ];
  const products = [
    ["P1", "Roti Tawar", "Makanan", 15000],
    ["P2", "Selai Kacang", "Makanan", 22000],
    ["P3", "Susu UHT", "Minuman", 18000],
    ["P4", "Kopi Bubuk", "Minuman", 25000],
    ["P5", "Gula Pasir", "Sembako", 14000],
    ["P6", "Teh Celup", "Minuman", 9000],
    ["P7", "Mentega", "Makanan", 12000],
    ["P8", "Beras 5kg", "Sembako", 65000],
  ];

  const start = new Date("2025-01-01T00:00:00.000Z");
  for (let day = 0; day < 120; day += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + day);
    const orderId = `ORD-${String(day + 1).padStart(4, "0")}`;
    const customerIndex = day % 15;
    const picked = [products[0], products[1], products[2 + (day % 6)]];
    for (const [code, name, category, price] of picked) {
      const qty = 1 + (day % 3);
      lines.push(
        [
          orderId,
          date.toISOString().slice(0, 10),
          `C${customerIndex}`,
          `Pelanggan ${customerIndex}`,
          code,
          name,
          category,
          qty,
          "pcs",
          price,
          qty * price,
          "online",
        ].join(","),
      );
    }
  }

  fs.writeFileSync(file, lines.join("\n"), "utf8");
  return file;
}

async function waitForJob(token: string, storeId: string, jobId: string): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/analytics/jobs/${jobId}`)
      .set(...auth(token))
      .expect(200);

    const data = res.body.data as Record<string, unknown>;
    if (data.status === "completed") return data;
    if (data.status === "failed") {
      const message =
        typeof data.errorMessage === "string" && data.errorMessage.length > 0
          ? data.errorMessage
          : "tanpa pesan";
      throw new Error(`ML job gagal: ${message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("ML job tidak selesai dalam 90 detik; pastikan services/ml berjalan.");
}

describe("alur end-to-end 15 langkah", () => {
  it("registrasi, undangan, import, ML nyata, dashboard, laporan, isolasi tenant, admin", async () => {
    // 1. Pemilik registrasi + login.
    const ownerEmail = uniqueEmail("owner");
    await register(ownerEmail, "Owner Utama");
    const ownerToken = await login(ownerEmail);

    // 2. Pemilik membuat toko.
    const storeRes = await request(app.getHttpServer())
      .post("/api/v1/stores")
      .set(...auth(ownerToken))
      .send({ name: "Toko E2E", city: "Bandung" })
      .expect(201);
    const storeId = storeRes.body.data.id as string;

    // 3. Pemilik mengundang pegawai.
    const staffEmail = uniqueEmail("staff");
    await register(staffEmail, "Pegawai Toko");
    const staffToken = await login(staffEmail);

    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/invitations`)
      .set(...auth(ownerToken))
      .send({ email: staffEmail, role: "STAFF" })
      .expect(201);
    const invitationToken = inviteRes.body.data.token as string;
    expect(invitationToken).toBeTruthy();

    // 4. Pegawai menerima undangan.
    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${invitationToken}/accept`)
      .set(...auth(staffToken))
      .expect(201);

    const staffStores = await request(app.getHttpServer())
      .get("/api/v1/stores")
      .set(...auth(staffToken))
      .expect(200);
    expect(staffStores.body.data.map((store: { id: string }) => store.id)).toContain(storeId);

    // 5. Pemilik mengunggah dataset.
    csvPath = writeDataset();
    const uploadRes = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/datasets`)
      .set(...auth(ownerToken))
      .attach("file", csvPath)
      .expect(201);
    const datasetId = uploadRes.body.data.id as string;

    // 6. Sistem memvalidasi dan membersihkan.
    await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/datasets/${datasetId}/mapping`)
      .set(...auth(ownerToken))
      .send({
        order_id: "order_id",
        order_date: "order_date",
        customer_code: "customer_code",
        customer_name: "customer_name",
        product_code: "product_code",
        product_name: "product_name",
        category: "category",
        qty: "qty",
        unit: "unit",
        unit_price: "unit_price",
        total_price: "total_price",
        channel: "channel",
      })
      .expect(201);

    const validation = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/datasets/${datasetId}/validate`)
      .set(...auth(ownerToken))
      .expect(201);
    expect(validation.body.data.status).toBe("VALIDATED");
    expect(validation.body.data.issues ?? []).toHaveLength(0);

    // 7. Data disimpan ke database.
    const committed = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/datasets/${datasetId}/commit`)
      .set(...auth(ownerToken))
      .expect(201);
    expect(committed.body.data.status).toBe("IMPORTED");
    expect(await prisma.orders.count({ where: { storeId } })).toBe(120);

    // 8. Pemilik menjalankan analisis.
    const runRes = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/analytics/run`)
      .set(...auth(ownerToken))
      .send({ jobType: "forecast", parameters: { horizonDays: 7 } })
      .expect(202);
    const jobId = runRes.body.data.jobId as string;

    // 9 + 10. Python menghasilkan hasil; NestJS menyimpannya.
    const job = await waitForJob(ownerToken, storeId, jobId);
    const result = job.result as Record<string, unknown>;
    expect(job.jobType).toBe("forecast");
    expect(result.store_id).toBe(storeId);
    expect(Array.isArray(result.forecasts)).toBe(true);
    expect((result.forecasts as unknown[]).length).toBe(7);
    expect(result.analyzed_at).toBeTruthy();

    // Segmentasi dijalankan lewat jalur yang sama; labelnya harus tersimpan
    // ke tabel customers agar ekspor per segmen punya isi.
    const segmentRun = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/analytics/run`)
      .set(...auth(ownerToken))
      .send({ jobType: "segmentation" })
      .expect(202);
    const segmentJob = await waitForJob(ownerToken, storeId, segmentRun.body.data.jobId as string);
    const segmentResult = segmentJob.result as Record<string, unknown>;
    expect(Array.isArray(segmentResult.assignments)).toBe(true);
    expect((segmentResult.assignments as unknown[]).length).toBeGreaterThan(0);
    expect(
      await prisma.customers.count({ where: { storeId, segment: { not: null } } }),
    ).toBeGreaterThan(0);

    // 11. Dashboard menampilkan hasil aktual dari data toko.
    const summary = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/analytics/summary?period=30d`)
      .set(...auth(ownerToken))
      .expect(200);
    expect(summary.body.data.totalOrders).toBeGreaterThan(0);
    expect(summary.body.data.totalSales).toBeGreaterThan(0);
    expect(summary.body.data.dataRange.end).toBe("2025-04-30");

    const trend = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/analytics/trend?period=30d`)
      .set(...auth(ownerToken))
      .expect(200);
    expect(trend.body.data).toHaveLength(30);

    // 12. Pemilik mengunduh laporan PDF.
    const report = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/reports/sales-summary/pdf?period=30d`)
      .set(...auth(ownerToken))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(report.headers["content-type"]).toContain("application/pdf");
    expect((report.body as Buffer).length).toBeGreaterThan(1000);

    // Laporan forecast memakai hasil ML toko bila belum ada forecast per produk.
    const firstProduct = await prisma.products.findFirst({ where: { storeId } });
    expect(firstProduct).not.toBeNull();
    const forecastReport = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/reports/forecast/${firstProduct!.id}`)
      .set(...auth(ownerToken))
      .expect(200);
    expect(forecastReport.text).toContain("Tingkat toko");

    // 13. Pegawai hanya melihat data toko yang ditugaskan.
    await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/analytics/summary?period=7d`)
      .set(...auth(staffToken))
      .expect(200);

    // 14. Pegawai tidak dapat mengakses toko lain dan tidak dapat menjalankan ML.
    const otherOwnerEmail = uniqueEmail("other");
    await register(otherOwnerEmail, "Owner Lain");
    const otherToken = await login(otherOwnerEmail);
    const otherStore = await request(app.getHttpServer())
      .post("/api/v1/stores")
      .set(...auth(otherToken))
      .send({ name: "Toko Lain", city: "Jakarta" })
      .expect(201);
    const otherStoreId = otherStore.body.data.id as string;

    await request(app.getHttpServer())
      .get(`/api/v1/stores/${otherStoreId}/analytics/summary`)
      .set(...auth(staffToken))
      .expect(403);

    const staffRun = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/analytics/run`)
      .set(...auth(staffToken))
      .send({ jobType: "forecast" });
    expect(staffRun.status).toBe(403);

    // jobType divalidasi server-side sebelum job dibuat. Request yang tidak
    // dikenal tidak boleh menghasilkan baris ml_jobs.
    const jobsBefore = await prisma.mlJobs.count({ where: { storeId } });
    await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/analytics/run`)
      .set(...auth(ownerToken))
      .send({ jobType: "bukan-analisis" })
      .expect(400);
    expect(await prisma.mlJobs.count({ where: { storeId } })).toBe(jobsBefore);

    // STAFF boleh membaca dan upload data harian, tetapi tidak boleh mengubah
    // katalog. Peran platform-nya tetap OWNER (dari registrasi), jadi test ini
    // membuktikan backend memakai peran TOKO, bukan peran platform.
    const staffProduct = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/products`)
      .set(...auth(staffToken))
      .send({ sku: "STAFF-1", name: "Tidak boleh dibuat", price: 1000 });
    expect(staffProduct.status).toBe(403);

    const staffCustomerExport = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/customers/export`)
      .set(...auth(staffToken));
    expect(staffCustomerExport.status).toBe(403);

    const staffReport = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/reports/sales-summary?period=30d`)
      .set(...auth(staffToken));
    expect(staffReport.status).toBe(200);

    // 15. Admin memantau status sistem, job ML, dan daftar toko.
    const adminEmail = uniqueEmail("admin");
    await register(adminEmail, "Admin Platform");
    await prisma.users.update({ where: { email: adminEmail }, data: { role: "ADMIN" } });
    const adminToken = await login(adminEmail);

    const adminStores = await request(app.getHttpServer())
      .get("/api/v1/admin/stores")
      .set(...auth(adminToken))
      .expect(200);
    expect(adminStores.body.data.map((store: { id: string }) => store.id)).toContain(storeId);

    const adminJobs = await request(app.getHttpServer())
      .get("/api/v1/admin/ml-jobs")
      .set(...auth(adminToken))
      .expect(200);
    expect(adminJobs.body.data.map((item: { id: string }) => item.id)).toContain(jobId);

    await request(app.getHttpServer())
      .get("/api/v1/health/details")
      .set(...auth(adminToken))
      .expect(200);
  }, 180_000);
});
