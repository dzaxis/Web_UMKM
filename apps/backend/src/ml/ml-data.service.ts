// src/ml/ml-data.service.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

/**
 * Bentuk data yang dikirim ke Python ML Service.
 *
 * Backend sengaja TIDAK mengirim tabel mentah. Python hanya menerima agregat
 * yang sudah dibatasi ke satu `storeId`, sehingga:
 * - tidak ada data toko lain yang bisa ikut terbawa;
 * - payload tetap kecil walau toko punya ratusan ribu transaksi;
 * - preprocessing yang sama dengan training tetap bisa dipakai.
 */
export type MlSeriesPoint = {
  date: string;
  sales: number;
  orders: number;
};

export type MlCustomerFeature = {
  customer_id: string;
  recency: number;
  frequency: number;
  monetary: number;
  tenure: number;
  avg_order_value: number;
};

export type MlTransaction = {
  order_id: string;
  items: string[];
};

type DailyRow = {
  day: Date | string;
  sales: unknown;
  orders: unknown;
};

type CustomerRow = {
  customer_id: string;
  last_order: Date | string;
  first_order: Date | string;
  frequency: unknown;
  monetary: unknown;
};

type TransactionRow = {
  order_id: string;
  products: string | null;
};

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Mengubah nilai hasil `$queryRaw` menjadi number.
 *
 * `$queryRaw` mengembalikan `Decimal` (kolom DECIMAL), `bigint` (COUNT/SUM),
 * atau `string` (beberapa driver), bukan selalu number. Tanpa cabang ini,
 * `SUM(total)` dan `COUNT(*)` terbaca 0 sehingga deret ML terlihat kosong
 * walaupun datanya ada.
 */
function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    if (value.trim() === "") return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value !== null) {
    // Prisma.Decimal dan BigInt wrapper punya `valueOf`/`toString`.
    const parsed = Number(value as { toString(): string });
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 86_400_000));
}

@Injectable()
export class MlDataService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deret penjualan harian satu toko.
   *
   * `SUM(total)` memakai total order yang sudah tersimpan (bukan menghitung
   * ulang qty x price), jadi angka ML identik dengan angka dashboard.
   */
  async forecastInput(storeId: string): Promise<{ series: MlSeriesPoint[]; warnings: string[] }> {
    const series = await this.dailySeries(storeId);
    if (series.length < 2) {
      throw new BadRequestException(
        "Data transaksi toko belum cukup untuk forecasting. Unggah minimal beberapa hari transaksi.",
      );
    }
    return { series, warnings: this.seriesWarnings(series) };
  }

  async anomalyInput(storeId: string): Promise<{ series: MlSeriesPoint[]; warnings: string[] }> {
    const series = await this.dailySeries(storeId);
    if (series.length < 3) {
      throw new BadRequestException(
        "Data transaksi toko belum cukup untuk deteksi anomali. Minimal dibutuhkan 3 hari data.",
      );
    }
    return { series, warnings: this.seriesWarnings(series) };
  }

  async segmentationInput(storeId: string): Promise<{
    customers: MlCustomerFeature[];
    warnings: string[];
  }> {
    const customers = await this.customerFeatures(storeId);
    if (customers.length < 2) {
      throw new BadRequestException(
        "Segmentasi membutuhkan minimal dua pelanggan dengan riwayat transaksi.",
      );
    }
    const warnings =
      customers.length < 5
        ? ["Jumlah pelanggan sangat kecil; segmen yang terbentuk belum representatif."]
        : [];
    return { customers, warnings };
  }

  async churnInput(storeId: string): Promise<{
    customers: MlCustomerFeature[];
    warnings: string[];
  }> {
    const customers = await this.customerFeatures(storeId);
    if (customers.length < 2) {
      throw new BadRequestException(
        "Prediksi churn membutuhkan minimal dua pelanggan dengan riwayat transaksi.",
      );
    }
    const warnings =
      customers.length < 10
        ? ["Jumlah pelanggan kecil; probabilitas churn perlu ditafsirkan dengan hati-hati."]
        : [];
    return { customers, warnings };
  }

  async basketInput(storeId: string): Promise<{
    transactions: MlTransaction[];
    warnings: string[];
    truncated: boolean;
  }> {
    const limit = 50_000;
    const rows = await this.prisma.$queryRaw<TransactionRow[]>`
      SELECT o.id AS order_id,
             GROUP_CONCAT(DISTINCT COALESCE(p.sku, oi.product_id) SEPARATOR '|') AS products
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.store_id = ${storeId}
        AND o.status NOT IN ('CANCELLED', 'CANCELED', 'REFUNDED')
      GROUP BY o.id
      HAVING COUNT(DISTINCT COALESCE(p.sku, oi.product_id)) >= 2
      ORDER BY MAX(o.order_date) DESC
      LIMIT ${limit}
    `;

    const transactions: MlTransaction[] = [];
    for (const row of rows) {
      const items = (row.products ?? "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      if (items.length >= 2) transactions.push({ order_id: row.order_id, items });
    }

    if (transactions.length < 2) {
      throw new BadRequestException(
        "Market basket membutuhkan minimal dua transaksi yang berisi dua produk atau lebih.",
      );
    }

    const warnings: string[] = [];
    if (transactions.length < 30) {
      warnings.push(
        "Volume transaksi kecil; aturan asosiasi bisa tidak stabil dan tidak boleh dianggap sebab-akibat.",
      );
    }
    const truncated = rows.length >= limit;
    if (truncated) {
      warnings.push(
        `Analisis dibatasi pada ${limit.toLocaleString("id-ID")} transaksi terbaru.`,
      );
    }
    return { transactions, warnings, truncated };
  }

  private async dailySeries(storeId: string): Promise<MlSeriesPoint[]> {
    const rows = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT DATE(order_date) AS day,
             SUM(COALESCE(total, 0)) AS sales,
             COUNT(*) AS orders
      FROM orders
      WHERE store_id = ${storeId}
        AND status NOT IN ('CANCELLED', 'CANCELED', 'REFUNDED')
      GROUP BY DATE(order_date)
      ORDER BY day ASC
    `;

    return rows
      .map((row) => ({
        date: isoDate(row.day),
        sales: Math.max(0, asNumber(row.sales)),
        orders: Math.max(0, Math.round(asNumber(row.orders))),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async customerFeatures(storeId: string): Promise<MlCustomerFeature[]> {
    const rows = await this.prisma.$queryRaw<CustomerRow[]>`
      SELECT c.id AS customer_id,
             MAX(o.order_date) AS last_order,
             MIN(o.order_date) AS first_order,
             COUNT(DISTINCT o.id) AS frequency,
             SUM(COALESCE(o.total, 0)) AS monetary
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.store_id = ${storeId}
        AND o.customer_id IS NOT NULL
        AND o.status NOT IN ('CANCELLED', 'CANCELED', 'REFUNDED')
      GROUP BY c.id
      ORDER BY c.id ASC
    `;

    if (rows.length === 0) return [];

    const reference = new Date(
      Math.max(...rows.map((row) => new Date(row.last_order).getTime())) + 86_400_000,
    );

    return rows.map((row) => {
      const lastOrder = new Date(row.last_order);
      const firstOrder = new Date(row.first_order);
      const frequency = Math.max(1, Math.round(asNumber(row.frequency)));
      const monetary = Math.max(0, asNumber(row.monetary));
      return {
        customer_id: row.customer_id,
        recency: daysBetween(reference, lastOrder),
        frequency,
        monetary,
        tenure: daysBetween(reference, firstOrder),
        avg_order_value: monetary / frequency,
      };
    });
  }

  private seriesWarnings(series: MlSeriesPoint[]): string[] {
    const warnings: string[] = [];
    if (series.length < 14) {
      warnings.push(
        "Histori transaksi kurang dari 14 hari; hasil forecasting belum layak dijadikan dasar keputusan.",
      );
    } else if (series.length < 60) {
      warnings.push(
        "Histori transaksi kurang dari 60 hari; prediksi jangka panjang memiliki ketidakpastian tinggi.",
      );
    }
    if (series.every((point) => point.sales === 0)) {
      warnings.push("Semua nilai penjualan nol pada periode ini.");
    }
    return warnings;
  }
}
