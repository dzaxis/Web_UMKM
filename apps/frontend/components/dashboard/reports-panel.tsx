"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";
import { useApiResource } from "./use-api-resource";

type ReportType = "sales-summary" | "detailed" | "forecast" | "customers";
type ReportFormat = "html" | "csv" | "xlsx" | "pdf";
type ProductOption = { id: string; sku: string; name: string };
type SegmentOption = { segment: string; customerCount: number };

const FORMATS_BY_TYPE: Record<ReportType, readonly ReportFormat[]> = {
  "sales-summary": ["html", "xlsx", "pdf"],
  detailed: ["csv", "xlsx"],
  forecast: ["html", "pdf"],
  customers: ["csv"],
};

export function ReportsPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [reportType, setReportType] = React.useState<ReportType>("sales-summary");
  const [period, setPeriod] = React.useState<"7d" | "30d" | "90d">("30d");
  const [format, setFormat] = React.useState<ReportFormat>("html");
  const [selectedProductId, setSelectedProductId] = React.useState<string>("");
  const [segmentFilter, setSegmentFilter] = React.useState<string>("all");

  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

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
        if (active) setMessage("Gagal memuat toko");
      });
    return () => {
      active = false;
    };
  }, [session.status, session.profile]);

  const loadProducts = React.useCallback(async (): Promise<ProductOption[]> => {
    if (!storeId) return [];
    const res = await fetch(`${API_BASE_URL}${API_PREFIX}/stores/${storeId}/products`, {
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Gagal memuat produk");
    return (data.data ?? []) as ProductOption[];
  }, [storeId]);

  const products = useApiResource(loadProducts);

  const loadSegments = React.useCallback(async (): Promise<SegmentOption[]> => {
    if (!storeId) return [];
    const res = await fetch(
      `${API_BASE_URL}${API_PREFIX}/stores/${storeId}/analytics/customer-segments`,
      { credentials: "include" },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Gagal memuat segmen");
    return (data.data ?? []) as SegmentOption[];
  }, [storeId]);

  const segments = useApiResource(loadSegments);

  const currentStore = stores.find((store) => store.id === storeId);
  const canExportCustomers = currentStore?.role === "OWNER";

  // Format yang tersedia diturunkan dari tipe laporan, bukan disimpan lewat
  // effect. Dengan begitu tidak ada render bertingkat dan tidak mungkin ada
  // kombinasi tipe/format yang tidak didukung.
  const allowedFormats = FORMATS_BY_TYPE[reportType];
  const effectiveFormat: ReportFormat = allowedFormats.includes(format)
    ? format
    : allowedFormats[0];
  const effectiveProductId = selectedProductId || products.data?.[0]?.id || "";

  async function downloadReport() {
    if (!storeId) return;
    setLoading(true);
    setMessage(null);

    try {
      let url: string;
      if (reportType === "customers") {
        url = `${API_BASE_URL}${API_PREFIX}/stores/${storeId}/customers/export?segment=${encodeURIComponent(segmentFilter)}`;
      } else {
        url = `${API_BASE_URL}${API_PREFIX}/stores/${storeId}/reports/`;

        if (reportType === "sales-summary") {
          url += "sales-summary";
          if (effectiveFormat === "xlsx") url += "/xlsx";
          else if (effectiveFormat === "pdf") url += "/pdf";
          url += `?period=${period}`;
        } else if (reportType === "detailed") {
          if (effectiveFormat === "xlsx") {
            url += "detailed/xlsx";
          } else {
            url += "detailed";
          }
        } else if (reportType === "forecast") {
          if (!effectiveProductId) {
            setMessage("Pilih produk untuk forecast report");
            setLoading(false);
            return;
          }
          url += `forecast/${effectiveProductId}`;
          if (effectiveFormat === "pdf") url += "/pdf";
        }
      }

      const res = await fetch(url, { credentials: "include" });

      if (!res.ok) {
        throw new Error("Gagal generate laporan");
      }

      const contentDisposition = res.headers.get("content-disposition");
      let filename = "laporan.html";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+?)"/);
        if (match) filename = match[1];
      }

      const blob = await res.blob();
      const urlObject = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = urlObject;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(urlObject);

      setMessage("Laporan berhasil didownload");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal download laporan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`px-4 py-3 rounded border ${
            message.includes("berhasil")
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buat Laporan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Toko</label>
            <select
              value={storeId || ""}
              onChange={(e) => setStoreId(e.target.value || null)}
              className="w-full border rounded px-3 py-2"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tipe Laporan</label>
            <div className="space-y-2">
              {[
                { value: "sales-summary" as const, label: "Ringkasan Penjualan" },
                { value: "detailed" as const, label: "Detail Pesanan & Item (90 hari)" },
                { value: "forecast" as const, label: "Forecast Produk / Toko" },
                ...(canExportCustomers
                  ? [
                      {
                        value: "customers" as const,
                        label: "Ekspor Pelanggan per Segmen (CSV)",
                      },
                    ]
                  : []),
              ].map((type) => (
                <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={type.value}
                    checked={reportType === type.value}
                    onChange={(e) => setReportType(e.target.value as ReportType)}
                    className="w-4 h-4"
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          {reportType === "sales-summary" && (
            <div>
              <label className="block text-sm font-medium mb-2">Periode</label>
              <div className="flex gap-2">
                {(["7d", "30d", "90d"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-2 rounded text-sm ${
                      period === p
                        ? "bg-blue-600 text-white"
                        : "border border-gray-300 bg-white hover:bg-gray-50"
                    }`}
                  >
                    {p === "7d" ? "7 hari" : p === "30d" ? "30 hari" : "90 hari"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {reportType === "forecast" && (
            <div>
              <label className="block text-sm font-medium mb-2">Produk</label>
              <select
                value={effectiveProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Pilih produk...</option>
                {(products.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} - {p.name}
                  </option>
                ))}
              </select>
              {products.status === "error" && (
                <p className="mt-2 text-sm text-red-700">Gagal memuat daftar produk.</p>
              )}
            </div>
          )}

          {reportType === "customers" && (
            <div>
              <label className="block text-sm font-medium mb-2">Segmen Pelanggan</label>
              <select
                value={segmentFilter}
                onChange={(e) => setSegmentFilter(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="all">Semua segmen</option>
                {(segments.data ?? []).map((segment) => (
                  <option key={segment.segment} value={segment.segment}>
                    {segment.segment} ({segment.customerCount})
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Segmen berasal dari hasil analisis RFM terakhir. Jalankan segmentasi
                di halaman Analisis ML agar daftar ini terisi.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Format</label>
            <select
              value={effectiveFormat}
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
              className="w-full border rounded px-3 py-2"
            >
              {allowedFormats.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={downloadReport}
            disabled={
              loading ||
              (reportType === "forecast" && !effectiveProductId) ||
              (reportType === "customers" && !canExportCustomers)
            }
            className="w-full"
          >
            {loading ? "Generating..." : "Download Laporan"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Info Format Laporan</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <strong>Ringkasan Penjualan:</strong> HTML, XLSX, dan PDF.
          </p>
          <p>
            <strong>Detail Pesanan:</strong> CSV dan XLSX (detail pesanan &amp;
            item 90 hari).
          </p>
          <p>
            <strong>Forecast:</strong> HTML interaktif dan PDF. Memakai forecast
            per produk bila tersedia; jika tidak, hasil analisis toko terakhir.
          </p>
          <p>
            <strong>Pelanggan:</strong> CSV per segmen, lengkap dengan catatan audit
            ekspor.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
