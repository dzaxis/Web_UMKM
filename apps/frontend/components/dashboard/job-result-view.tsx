"use client";

import * as React from "react";
import {
  toAnomalyChart,
  toBasketChart,
  toChurnChart,
  toForecastChart,
  toSegmentChart,
} from "@/lib/chart-data";
import {
  AnomalyChart,
  BasketChart,
  ChurnChart,
  ForecastChart,
  SegmentChart,
} from "./charts";

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return typeof value === "object" && value !== null ? (value as Json) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "-"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: unknown): string {
  const parsed = num(value);
  return parsed === null ? "-" : `${parsed.toFixed(1)}%`;
}

function rupiah(value: unknown): string {
  const parsed = num(value);
  return parsed === null
    ? "-"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(parsed);
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
        Tidak ada baris hasil untuk ditampilkan.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-600">
            {headers.map((header) => (
              <th key={header} className="px-2 py-2 text-left font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Warnings({ warnings }: { warnings: unknown }) {
  const items = asArray(warnings).filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  if (items.length === 0) return null;
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="mb-1 font-medium">Catatan keterbatasan</p>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

function ForecastView({ result }: { result: Json }) {
  const chart = toForecastChart(result);
  const metadata = asRecord(result.metadata);
  const metrics = asRecord(metadata?.metrics);
  return (
    <div className="space-y-4">
      <ForecastChart data={chart} />
      {chart.length > 0 && (
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <p className="text-slate-500">Model</p>
            <p className="font-medium">{text(metadata?.model, "baseline")}</p>
          </div>
          <div>
            <p className="text-slate-500">MAE</p>
            <p className="font-medium">{rupiah(metrics?.mae)}</p>
          </div>
          <div>
            <p className="text-slate-500">RMSE</p>
            <p className="font-medium">{rupiah(metrics?.rmse)}</p>
          </div>
          <div>
            <p className="text-slate-500">WAPE</p>
            <p className="font-medium">
              {metrics?.wape === null || metrics?.wape === undefined
                ? "-"
                : `${(Number(metrics.wape) * 100).toFixed(1)}%`}
            </p>
          </div>
        </div>
      )}
      <Table
        headers={["Tanggal", "Prediksi", "Batas bawah", "Batas atas"]}
        rows={chart.map((point) => [
          point.date,
          rupiah(point.predicted),
          rupiah(point.lower),
          rupiah(point.upper),
        ])}
      />
    </div>
  );
}

function SegmentationView({ result }: { result: Json }) {
  const chart = toSegmentChart(result);
  const rows = asArray(result.segments).flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    return [
      [
        text(row.segment),
        String(num(row.customers) ?? "-"),
        pct(row.customer_pct),
        pct(row.revenue_pct),
        text(row.recommendation),
      ],
    ];
  });

  return (
    <div className="space-y-4">
      <SegmentChart data={chart} />
      <Table
        headers={["Segmen", "Pelanggan", "% Pelanggan", "% Omzet", "Rekomendasi"]}
        rows={rows}
      />
    </div>
  );
}

function BasketView({ result }: { result: Json }) {
  const chart = toBasketChart(result);
  const rows = asArray(result.rules).flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const antecedent = asArray(row.antecedent).join(", ");
    const consequent = asArray(row.consequent).join(", ");
    return [
      [
        `${antecedent} → ${consequent}`,
        `${(Number(num(row.support) ?? 0) * 100).toFixed(1)}%`,
        `${(Number(num(row.confidence) ?? 0) * 100).toFixed(1)}%`,
        (num(row.lift) ?? 0).toFixed(2),
        String(num(row.transactions) ?? "-"),
      ],
    ];
  });

  return (
    <div className="space-y-4">
      <BasketChart data={chart} />
      <Table
        headers={["Kombinasi", "Support", "Confidence", "Lift", "Transaksi"]}
        rows={rows}
      />
      <p className="text-xs text-slate-500">
        Lift &gt; 1 berarti kombinasi lebih sering muncul daripada kebetulan. Ini
        asosiasi, bukan bukti sebab-akibat.
      </p>
    </div>
  );
}

function ChurnView({ result }: { result: Json }) {
  const chart = toChurnChart(result);
  const rows = asArray(result.high_risk_customers).flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    return [
      [
        text(row.customer_id),
        `${((num(row.churn_probability) ?? 0) * 100).toFixed(1)}%`,
        text(row.risk_level),
        String(num(row.recency) ?? "-"),
        String(num(row.frequency) ?? "-"),
        rupiah(row.monetary),
        text(row.recommendation),
      ],
    ];
  });

  return (
    <div className="space-y-4">
      <ChurnChart data={chart} />
      <Table
        headers={[
          "Pelanggan",
          "Probabilitas",
          "Risiko",
          "Recency (hari)",
          "Frekuensi",
          "Monetary",
          "Rekomendasi",
        ]}
        rows={rows}
      />
    </div>
  );
}

function AnomalyView({ result }: { result: Json }) {
  const chart = toAnomalyChart(result);
  const rows = chart.map((point) => [
    point.date,
    rupiah(point.actual),
    point.baseline === null ? "-" : rupiah(point.baseline),
    point.type === "drop" ? "Penurunan" : "Lonjakan",
  ]);

  return (
    <div className="space-y-4">
      <AnomalyChart data={chart} />
      <Table
        headers={["Tanggal", "Aktual", "Baseline", "Jenis"]}
        rows={rows}
      />
      <p className="text-xs text-slate-500">
        Tanda anomali berarti pola perlu ditinjau, bukan otomatis kesalahan atau fraud.
      </p>
    </div>
  );
}

export function JobResultView({
  jobType,
  result,
}: {
  jobType: string;
  result: unknown;
}) {
  const payload = asRecord(result);
  if (!payload) {
    return <p className="text-sm text-slate-500">Belum ada hasil tersimpan.</p>;
  }

  let view: React.ReactNode = null;
  if (jobType === "forecast") view = <ForecastView result={payload} />;
  else if (jobType === "segmentation") view = <SegmentationView result={payload} />;
  else if (jobType === "basket" || jobType === "market-basket")
    view = <BasketView result={payload} />;
  else if (jobType === "churn") view = <ChurnView result={payload} />;
  else if (jobType === "anomaly") view = <AnomalyView result={payload} />;

  return (
    <div className="space-y-4">
      {view}
      {typeof payload.explanation === "string" && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {payload.explanation}
        </div>
      )}
      <Warnings warnings={payload.warnings} />
      <details className="rounded border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">
          Lihat JSON mentah (untuk audit)
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto text-xs text-slate-700">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}
