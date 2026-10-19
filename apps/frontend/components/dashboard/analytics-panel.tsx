"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";
import { useApiResource } from "./use-api-resource";
import { SalesTrendChart } from "./charts";

type SalesSummary = {
  totalSales: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  avgItemsPerOrder: number;
  period: string;
  dataRange?: {
    start: string;
    end: string;
    latestDataDate: string | null;
    hasData: boolean;
  };
};

type SalesTrend = Array<{
  date: string;
  sales: number;
  orderCount: number;
  itemCount: number;
}>;

type TopProduct = {
  productId: string;
  sku: string;
  name: string;
  totalQty: number;
  totalRevenue: number;
  orderCount: number;
};

type AnalyticsBundle = {
  summary: SalesSummary | null;
  trend: SalesTrend;
  products: TopProduct[];
};

export function AnalyticsPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState<"7d" | "30d" | "ytd">("30d");

  React.useEffect(() => {
    if (session.status !== "ready" || !session.profile) return;
    let active = true;
    void listAccessibleStores()
      .then((items) => {
        if (!active) return;
        setStores(items);
        if (items.length > 0) setStoreId(items[0].id);
      })
      .catch(() => {
        if (active) setStores([]);
      });
    return () => {
      active = false;
    };
  }, [session.status, session.profile]);

  const load = React.useCallback(async (): Promise<AnalyticsBundle | null> => {
    if (!storeId) return null;
    const headers = { credentials: "include" as const };
    const [summaryRes, trendRes, productsRes] = await Promise.all([
      fetch(`${API_BASE_URL}${API_PREFIX}/stores/${storeId}/analytics/summary?period=${period}`, { headers }),
      fetch(`${API_BASE_URL}${API_PREFIX}/stores/${storeId}/analytics/trend?period=${period}`, { headers }),
      fetch(`${API_BASE_URL}${API_PREFIX}/stores/${storeId}/analytics/top-products?limit=10`, { headers }),
    ]);

    const [summaryData, trendData, productsData] = await Promise.all([
      summaryRes.json(),
      trendRes.json(),
      productsRes.json(),
    ]);

    if (!summaryRes.ok || !trendRes.ok || !productsRes.ok) {
      throw new Error(
        summaryData?.error?.message ??
          trendData?.error?.message ??
          productsData?.error?.message ??
          "Gagal memuat analytics",
      );
    }

    return {
      summary: (summaryData.data ?? null) as SalesSummary | null,
      trend: (trendData.data ?? []) as SalesTrend,
      products: (productsData.data ?? []) as TopProduct[],
    };
  }, [storeId, period]);

  const analytics = useApiResource(load);
  const summary = analytics.data?.summary ?? null;
  const trend = analytics.data?.trend ?? [];
  const topProducts = analytics.data?.products ?? [];

  return (
    <div className="space-y-6">
      {analytics.status === "error" && analytics.error !== null && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {analytics.error.message}
        </div>
      )}

      <div className="flex gap-4 items-center flex-wrap">
        <select
          value={storeId || ""}
          onChange={(e) => setStoreId(e.target.value || null)}
          className="border rounded px-3 py-2"
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          {(["7d", "30d", "ytd"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-2 rounded text-sm ${
                period === p
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 bg-white hover:bg-gray-50"
              }`}
            >
              {p === "7d" ? "7 hari" : p === "30d" ? "30 hari" : "YTD"}
            </button>
          ))}
        </div>

        <Button onClick={analytics.reload} disabled={analytics.status === "loading"}>
          {analytics.status === "loading" ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {stores.length === 0 && session.status === "ready" && (
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          Belum ada toko yang bisa diakses. Buat toko terlebih dahulu di halaman Toko &amp; Tim.
        </div>
      )}

      {summary?.dataRange?.hasData && (
        <p className="text-sm text-slate-600">
          Periode data: <strong>{summary.dataRange.start}</strong> s/d{" "}
          <strong>{summary.dataRange.end}</strong> (transaksi terakhir{" "}
          {summary.dataRange.latestDataDate}).
        </p>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Penjualan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              Rp {summary ? (summary.totalSales / 1_000_000).toFixed(1) : "0"}jt
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Pesanan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalOrders || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Nilai Rata-rata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              Rp {summary ? (summary.avgOrderValue / 1_000_000).toFixed(1) : "0"}jt
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Item
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalItems || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card>
        <CardHeader>
          <CardTitle>Produk Terlaris</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">SKU</th>
                  <th className="text-left py-2 px-2">Nama</th>
                  <th className="text-right py-2 px-2">Qty</th>
                  <th className="text-right py-2 px-2">Revenue</th>
                  <th className="text-right py-2 px-2">Order</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.productId} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{p.sku}</td>
                    <td className="py-2 px-2">{p.name}</td>
                    <td className="text-right py-2 px-2">{p.totalQty}</td>
                    <td className="text-right py-2 px-2">
                      Rp {(p.totalRevenue / 1_000_000).toFixed(1)}jt
                    </td>
                    <td className="text-right py-2 px-2">{p.orderCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Tren Penjualan</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesTrendChart data={trend} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Tanggal</th>
                  <th className="text-right py-2 px-2">Penjualan</th>
                  <th className="text-right py-2 px-2">Pesanan</th>
                  <th className="text-right py-2 px-2">Item</th>
                </tr>
              </thead>
              <tbody>
                {trend.slice(-10).map((t) => (
                  <tr key={t.date} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{t.date}</td>
                    <td className="text-right py-2 px-2">
                      Rp {(t.sales / 1_000_000).toFixed(1)}jt
                    </td>
                    <td className="text-right py-2 px-2">{t.orderCount}</td>
                    <td className="text-right py-2 px-2">{t.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
