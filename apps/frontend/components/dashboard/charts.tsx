"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AnomalyPoint,
  BasketPoint,
  ChurnPoint,
  ForecastPoint,
  SegmentPoint,
} from "@/lib/chart-data";

const AXIS = "#64748b";
const GRID = "#e2e8f0";
const ACCENT = "#0891b2";
const NAVY = "#1e3a8a";

const rupiah = (value: number): string =>
  new Intl.NumberFormat("id-ID", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value);

const fullRupiah = (value: number): string =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

/** Recharts memberi `ValueType | undefined`; jangan biarkan `NaN` masuk. */
const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * `prefers-reduced-motion` dibaca lewat `useSyncExternalStore`, bukan
 * `useEffect` + `useState`. Effect yang men-set state akan memicu render
 * berlapis dan dilarang oleh aturan lint repo ini.
 */
function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () =>
      typeof window === "undefined"
        ? false
        : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function ChartFrame({
  height = 280,
  children,
}: {
  height?: number;
  children: React.ReactElement;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const empty = (message: string) => (
  <div className="flex h-40 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
    {message}
  </div>
);

export function SalesTrendChart({
  data,
}: {
  data: Array<{ date: string; sales: number; orderCount: number }>;
}) {
  const reduced = usePrefersReducedMotion();
  if (data.length === 0) return empty("Belum ada transaksi pada periode ini.");

  return (
    <ChartFrame>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          stroke={AXIS}
          fontSize={11}
          tickFormatter={(value: string) => value.slice(5)}
          minTickGap={24}
        />
        <YAxis
          stroke={AXIS}
          fontSize={11}
          width={54}
          tickFormatter={(value: number) => rupiah(value)}
        />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            name === "sales"
              ? [fullRupiah(toNumber(value)), "Penjualan"]
              : [String(toNumber(value)), "Pesanan"]
          }
          labelFormatter={(label: React.ReactNode) => `Tanggal ${String(label)}`}
        />
        <Area
          type="monotone"
          dataKey="sales"
          stroke={ACCENT}
          strokeWidth={2}
          fill="url(#sales-fill)"
          isAnimationActive={!reduced}
        />
      </AreaChart>
    </ChartFrame>
  );
}

export function ForecastChart({ data }: { data: ForecastPoint[] }) {
  const reduced = usePrefersReducedMotion();
  if (data.length === 0) return empty("Forecast belum menghasilkan titik prediksi.");

  // Recharts tidak punya "confidence band" bawaan. Dua area bertumpuk
  // (lower transparan + selisih upper-lower) membentuk pita yang sama.
  const rows = data.map((point) => ({
    ...point,
    band: Math.max(0, point.upper - point.lower),
  }));

  return (
    <>
      <ChartFrame>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            stroke={AXIS}
            fontSize={11}
            tickFormatter={(value: string) => value.slice(5)}
            minTickGap={20}
          />
          <YAxis
            stroke={AXIS}
            fontSize={11}
            width={54}
            tickFormatter={(value: number) => rupiah(value)}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const labels: Record<string, string> = {
                predicted: "Prediksi",
                lower: "Batas bawah",
                band: "Rentang atas",
              };
              return [fullRupiah(toNumber(value)), labels[String(name)] ?? String(name)];
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="lower"
            stackId="interval"
            stroke="none"
            fill="transparent"
            isAnimationActive={!reduced}
            name="Batas bawah"
          />
          <Area
            type="monotone"
            dataKey="band"
            stackId="interval"
            stroke="none"
            fill="#67e8f9"
            fillOpacity={0.35}
            isAnimationActive={!reduced}
            name="Rentang prediksi"
          />
          <Line
            type="monotone"
            dataKey="predicted"
            stroke={NAVY}
            strokeWidth={2}
            dot={false}
            isAnimationActive={!reduced}
            name="Prediksi"
          />
        </ComposedChart>
      </ChartFrame>
      <p className="mt-2 text-xs text-slate-500">
        Pita biru adalah rentang ketidakpastian model, bukan jaminan hasil aktual.
      </p>
    </>
  );
}

export function SegmentChart({ data }: { data: SegmentPoint[] }) {
  const reduced = usePrefersReducedMotion();
  if (data.length === 0) return empty("Belum ada segmen pelanggan yang terbentuk.");

  return (
    <ChartFrame height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="segment" stroke={AXIS} fontSize={10} interval={0} angle={-12} height={52} textAnchor="end" />
        <YAxis yAxisId="left" stroke={AXIS} fontSize={11} width={40} allowDecimals={false} />
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke={AXIS}
          fontSize={11}
          width={44}
          tickFormatter={(value: number) => `${value}%`}
        />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            name === "customers"
              ? [String(toNumber(value)), "Pelanggan"]
              : [`${toNumber(value)}%`, "Kontribusi omzet"]
          }
        />
        <Legend />
        <Bar
          yAxisId="left"
          dataKey="customers"
          fill={ACCENT}
          name="Pelanggan"
          radius={[4, 4, 0, 0]}
          isAnimationActive={!reduced}
        />
        <Bar
          yAxisId="right"
          dataKey="revenuePct"
          fill="#f59e0b"
          name="Kontribusi omzet (%)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={!reduced}
        />
      </BarChart>
    </ChartFrame>
  );
}

export function BasketChart({ data }: { data: BasketPoint[] }) {
  const reduced = usePrefersReducedMotion();
  if (data.length === 0) return empty("Tidak ada kombinasi produk yang memenuhi ambang batas.");

  const rows = data.slice(0, 10).map((point) => ({
    ...point,
    shortLabel:
      point.label.length > 42 ? `${point.label.slice(0, 39)}...` : point.label,
  }));

  return (
    <ChartFrame height={Math.max(240, rows.length * 42)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke={AXIS} fontSize={11} />
        <YAxis
          type="category"
          dataKey="shortLabel"
          stroke={AXIS}
          fontSize={10}
          width={170}
        />
        <Tooltip formatter={(value: unknown) => [`${toNumber(value).toFixed(2)}x`, "Lift"]} />
        <Bar
          dataKey="lift"
          fill={NAVY}
          name="Lift"
          radius={[0, 4, 4, 0]}
          isAnimationActive={!reduced}
        />
      </BarChart>
    </ChartFrame>
  );
}

const RISK_COLORS: Record<string, string> = {
  High: "#dc2626",
  Medium: "#f59e0b",
  Low: "#16a34a",
};

export function ChurnChart({ data }: { data: ChurnPoint[] }) {
  const reduced = usePrefersReducedMotion();
  if (data.length === 0) return empty("Belum ada prediksi churn.");

  return (
    <ChartFrame height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="risk" stroke={AXIS} fontSize={11} />
        <YAxis stroke={AXIS} fontSize={11} width={40} allowDecimals={false} />
        <Tooltip formatter={(value: unknown) => [String(toNumber(value)), "Pelanggan"]} />
        <Bar dataKey="count" name="Pelanggan" radius={[4, 4, 0, 0]} isAnimationActive={!reduced}>
          {data.map((entry) => (
            <Cell key={entry.risk} fill={RISK_COLORS[entry.risk] ?? ACCENT} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function AnomalyChart({ data }: { data: AnomalyPoint[] }) {
  const reduced = usePrefersReducedMotion();
  if (data.length === 0) return empty("Tidak ada anomali yang terdeteksi pada data ini.");

  return (
    <ChartFrame height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          stroke={AXIS}
          fontSize={11}
          tickFormatter={(value: string) => value.slice(5)}
          minTickGap={20}
        />
        <YAxis
          stroke={AXIS}
          fontSize={11}
          width={54}
          tickFormatter={(value: number) => rupiah(value)}
        />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            name === "actual"
              ? [fullRupiah(toNumber(value)), "Aktual"]
              : [fullRupiah(toNumber(value)), "Baseline"]
          }
        />
        <Legend />
        <Bar dataKey="actual" name="Nilai aktual" radius={[4, 4, 0, 0]} isAnimationActive={!reduced}>
          {data.map((entry) => (
            <Cell
              key={`${entry.date}-${entry.type}`}
              fill={entry.type === "drop" ? "#dc2626" : "#f59e0b"}
            />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="baseline"
          name="Baseline"
          stroke={NAVY}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={!reduced}
        />
      </ComposedChart>
    </ChartFrame>
  );
}
