import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { MlDataService } from "./ml-data.service.js";

/**
 * MlDataService hanya boleh mengirim agregat milik SATU toko.
 *
 * Test di sini memakai Prisma palsu, jadi yang dibuktikan adalah bentuk input
 * dan perhitungan fitur - bukan SQL-nya. SQL-nya sendiri diuji oleh e2e yang
 * memakai MySQL sungguhan.
 */
function serviceWith(rows: unknown[]) {
  const queryRaw = vi.fn().mockResolvedValue(rows);
  const prisma = { $queryRaw: queryRaw } as never;
  return { service: new MlDataService(prisma), queryRaw };
}

describe("MlDataService", () => {
  it("forecastInput mengurutkan deret dan mengubah Decimal menjadi number", async () => {
    const { service } = serviceWith([
      // Prisma mengembalikan Decimal (objek) dan bigint untuk COUNT/SUM,
      // bukan selalu string/number. Keduanya wajib terbaca sebagai angka.
      { day: "2026-01-03", sales: { toString: () => "150000.00" }, orders: 3n },
      { day: "2026-01-01", sales: 100000, orders: 2 },
      { day: "2026-01-02", sales: null, orders: null },
    ]);

    const result = await service.forecastInput("store-1");

    expect(result.series).toEqual([
      { date: "2026-01-01", sales: 100000, orders: 2 },
      { date: "2026-01-02", sales: 0, orders: 0 },
      { date: "2026-01-03", sales: 150000, orders: 3 },
    ]);
  });

  it("forecastInput menolak toko tanpa transaksi", async () => {
    const { service } = serviceWith([]);
    await expect(service.forecastInput("store-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("segmentationInput menghitung recency, tenure, dan avg order value", async () => {
    const { service } = serviceWith([
      {
        customer_id: "c1",
        last_order: "2026-01-10",
        first_order: "2026-01-01",
        frequency: "2",
        monetary: "300000",
      },
      {
        customer_id: "c2",
        last_order: "2026-01-05",
        first_order: "2026-01-05",
        frequency: 1,
        monetary: 50000,
      },
    ]);

    const result = await service.segmentationInput("store-1");

    // Referensi = transaksi terakhir (10 Jan) + 1 hari = 11 Jan.
    expect(result.customers).toEqual([
      {
        customer_id: "c1",
        recency: 1,
        frequency: 2,
        monetary: 300000,
        tenure: 10,
        avg_order_value: 150000,
      },
      {
        customer_id: "c2",
        recency: 6,
        frequency: 1,
        monetary: 50000,
        tenure: 6,
        avg_order_value: 50000,
      },
    ]);
  });

  it("basketInput memecah GROUP_CONCAT dan membuang transaksi satu produk", async () => {
    const { service } = serviceWith([
      { order_id: "o1", products: "SKU-A|SKU-B" },
      { order_id: "o2", products: "SKU-A" },
      { order_id: "o3", products: "SKU-B|SKU-C|SKU-B" },
    ]);

    const result = await service.basketInput("store-1");

    expect(result.transactions).toEqual([
      { order_id: "o1", items: ["SKU-A", "SKU-B"] },
      { order_id: "o3", items: ["SKU-B", "SKU-C", "SKU-B"] },
    ]);
    expect(result.warnings.join(" ")).toContain("Volume transaksi kecil");
  });

  it("anomalyInput menolak deret yang terlalu pendek", async () => {
    const { service } = serviceWith([
      { day: "2026-01-01", sales: 1, orders: 1 },
      { day: "2026-01-02", sales: 2, orders: 1 },
    ]);

    await expect(service.anomalyInput("store-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
