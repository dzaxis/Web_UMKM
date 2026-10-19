/**
 * Pemetaan hasil ML menjadi deret yang siap diplot.
 *
 * Semua fungsi di sini murni dan defensif: hasil job berasal dari JSON yang
 * disimpan di kolom `outputResult`, jadi bentuknya diperiksa di sini, bukan
 * dipercaya. Kalau model mengembalikan bentuk yang berbeda, chart menerima
 * array kosong - bukan `NaN` yang tampak seperti grafik rusak.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type ForecastPoint = {
  date: string;
  predicted: number;
  lower: number;
  upper: number;
};

export function toForecastChart(result: unknown): ForecastPoint[] {
  const rows = asArray(asRecord(result)?.forecasts);
  const out: ForecastPoint[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const date = typeof r.date === "string" ? r.date : null;
    const predicted = num(r.predicted);
    if (date === null || predicted === null) continue;
    out.push({
      date,
      predicted,
      lower: num(r.lower) ?? predicted,
      upper: num(r.upper) ?? predicted,
    });
  }
  return out;
}

export type SegmentPoint = {
  segment: string;
  customers: number;
  customerPct: number;
  revenuePct: number;
};

export function toSegmentChart(result: unknown): SegmentPoint[] {
  const rows = asArray(asRecord(result)?.segments);
  const out: SegmentPoint[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const segment = typeof r.segment === "string" ? r.segment : null;
    const customers = num(r.customers);
    if (segment === null || customers === null) continue;
    out.push({
      segment,
      customers,
      customerPct: num(r.customer_pct) ?? 0,
      revenuePct: num(r.revenue_pct) ?? 0,
    });
  }
  return out;
}

export type BasketPoint = {
  label: string;
  lift: number;
  support: number;
  confidence: number;
};

function toCommaList(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "string") return value;
  return "";
}

export function toBasketChart(result: unknown): BasketPoint[] {
  const rows = asArray(asRecord(result)?.rules);
  const out: BasketPoint[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const lift = num(r.lift);
    if (lift === null) continue;
    const antecedent = toCommaList(r.antecedent);
    const consequent = toCommaList(r.consequent);
    out.push({
      label: `${antecedent} → ${consequent}`,
      lift,
      support: num(r.support) ?? 0,
      confidence: num(r.confidence) ?? 0,
    });
  }
  return out;
}

export type ChurnPoint = {
  risk: string;
  count: number;
};

export function toChurnChart(result: unknown): ChurnPoint[] {
  const summary = asRecord(asRecord(result)?.summary);
  if (!summary) return [];
  const out: ChurnPoint[] = [];
  for (const risk of ["Low", "Medium", "High"]) {
    const count = num(summary[risk]);
    if (count !== null) out.push({ risk, count });
  }
  return out;
}

export type AnomalyPoint = {
  date: string;
  actual: number;
  baseline: number | null;
  type: string;
};

export function toAnomalyChart(result: unknown): AnomalyPoint[] {
  const rows = asArray(asRecord(result)?.anomalies);
  const out: AnomalyPoint[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const date = typeof r.date === "string" ? r.date : null;
    const actual = num(r.actual_sales);
    if (date === null || actual === null) continue;
    out.push({
      date,
      actual,
      baseline: num(r.baseline),
      type: typeof r.type === "string" ? r.type : "anomaly",
    });
  }
  return out;
}
