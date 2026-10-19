import type { PrismaService } from "../../database/prisma.service.js";

/**
 * Status pesanan yang TIDAK dihitung sebagai penjualan.
 *
 * Satu definisi dipakai dashboard, laporan, dan ML supaya ketiganya tidak
 * pernah menampilkan angka berbeda untuk transaksi yang sama.
 */
export const EXCLUDED_ORDER_STATUSES = ["CANCELLED", "CANCELED", "REFUNDED"] as const;

export interface StoreWindow {
  /** Awal periode (00:00:00.000 UTC). */
  start: Date;
  /** Akhir periode (23:59:59.999 UTC). */
  end: Date;
  /** Tanggal transaksi terakhir toko, atau null bila toko belum punya data. */
  latestDataDate: Date | null;
  /** True bila toko punya minimal satu transaksi yang dihitung. */
  hasData: boolean;
}

function startOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

/**
 * Menentukan periode analitik relatif terhadap DATA TERAKHIR toko.
 *
 * Memakai `new Date()` akan membuat semua dashboard kosong ketika dataset
 * historis diimpor (mis. data 2021-2025 dibuka pada 2026). "30 hari terakhir"
 * di aplikasi analitik berarti 30 hari terakhir yang ada datanya, bukan 30
 * hari terakhir di kalender dinding.
 *
 * `days = null` berarti year-to-date pada tahun data terakhir.
 */
export async function resolveStoreWindow(
  prisma: PrismaService,
  storeId: string,
  days: number | null,
): Promise<StoreWindow> {
  const latest = await prisma.orders.aggregate({
    where: {
      storeId,
      status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
    },
    _max: { orderDate: true },
  });

  const latestDataDate = latest._max.orderDate ?? null;
  const end = endOfUtcDay(latestDataDate ?? new Date());

  const start = startOfUtcDay(end);
  if (days === null) {
    start.setUTCMonth(0, 1);
  } else {
    start.setUTCDate(start.getUTCDate() - (Math.max(1, days) - 1));
  }

  return {
    start,
    end,
    latestDataDate,
    hasData: latestDataDate !== null,
  };
}

/** Daftar tanggal ISO (YYYY-MM-DD) inklusif dari `start` sampai `end`. */
export function eachUtcDate(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cursor = startOfUtcDay(start);
  const limit = endOfUtcDay(end);
  while (cursor <= limit) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Rentang data untuk dikirim ke frontend (string ISO, aman untuk JSON). */
export function serializeWindow(window: StoreWindow): {
  start: string;
  end: string;
  latestDataDate: string | null;
  hasData: boolean;
} {
  return {
    start: window.start.toISOString().slice(0, 10),
    end: window.end.toISOString().slice(0, 10),
    latestDataDate: window.latestDataDate
      ? window.latestDataDate.toISOString().slice(0, 10)
      : null,
    hasData: window.hasData,
  };
}
