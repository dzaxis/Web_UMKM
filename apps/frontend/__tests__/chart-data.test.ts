import { describe, expect, it } from "vitest";

import {
  toAnomalyChart,
  toBasketChart,
  toChurnChart,
  toForecastChart,
  toSegmentChart,
} from "@/lib/chart-data";

describe("toForecastChart", () => {
  it("memetakan titik forecast dan mempertahankan interval", () => {
    const out = toForecastChart({
      forecasts: [
        { date: "2026-01-01", predicted: 10, lower: 8, upper: 12 },
        { date: "2026-01-02", predicted: 11, lower: 9, upper: 13 },
      ],
    });
    expect(out).toEqual([
      { date: "2026-01-01", predicted: 10, lower: 8, upper: 12 },
      { date: "2026-01-02", predicted: 11, lower: 9, upper: 13 },
    ]);
  });

  it("mengisi interval yang hilang dengan nilai prediksi", () => {
    const out = toForecastChart({ forecasts: [{ date: "2026-01-01", predicted: 10 }] });
    expect(out[0]).toEqual({ date: "2026-01-01", predicted: 10, lower: 10, upper: 10 });
  });

  it("mengembalikan array kosong untuk bentuk tak dikenal", () => {
    expect(toForecastChart(null)).toEqual([]);
    expect(toForecastChart({})).toEqual([]);
    expect(toForecastChart({ forecasts: "bukan array" })).toEqual([]);
  });
});

describe("toSegmentChart", () => {
  it("memetakan segmen", () => {
    const out = toSegmentChart({
      segments: [
        { segment: "VIP", customers: 3, customer_pct: 30, revenue_pct: 70 },
      ],
    });
    expect(out).toEqual([
      { segment: "VIP", customers: 3, customerPct: 30, revenuePct: 70 },
    ]);
  });

  it("melewati baris tanpa customers atau segment", () => {
    expect(
      toSegmentChart({ segments: [{ customers: 3 }, { segment: "X" }] }),
    ).toEqual([]);
  });
});

describe("toBasketChart", () => {
  it("menggabungkan antecedent/consequent menjadi label", () => {
    const out = toBasketChart({
      rules: [
        { antecedent: ["A", "B"], consequent: ["C"], support: 0.01, confidence: 0.2, lift: 1.5 },
      ],
    });
    expect(out[0]).toEqual({
      label: "A, B → C",
      lift: 1.5,
      support: 0.01,
      confidence: 0.2,
    });
  });

  it("menerima antecedent berupa string", () => {
    const out = toBasketChart({
      rules: [{ antecedent: "frozenset({'A'})", consequent: "frozenset({'B'})", lift: 2 }],
    });
    expect(out[0].label).toBe("frozenset({'A'}) → frozenset({'B'})");
  });

  it("mengembalikan kosong untuk data tidak valid", () => {
    expect(toBasketChart({ rules: null })).toEqual([]);
  });
});

describe("toChurnChart", () => {
  it("memberi urutan tetap Low, Medium, High", () => {
    const out = toChurnChart({ summary: { High: 5, Low: 10, Medium: 3 } });
    expect(out).toEqual([
      { risk: "Low", count: 10 },
      { risk: "Medium", count: 3 },
      { risk: "High", count: 5 },
    ]);
  });

  it("mengembalikan kosong tanpa summary", () => {
    expect(toChurnChart({})).toEqual([]);
  });
});

describe("toAnomalyChart", () => {
  it("memetakan anomali dengan baseline opsional", () => {
    const out = toAnomalyChart({
      anomalies: [
        { date: "2026-01-01", actual_sales: 100, baseline: 60, type: "spike" },
        { date: "2026-01-02", actual_sales: 20, baseline: null, type: "drop" },
      ],
    });
    expect(out[0]).toEqual({
      date: "2026-01-01",
      actual: 100,
      baseline: 60,
      type: "spike",
    });
    expect(out[1].baseline).toBeNull();
  });
});
