# app/inference/store_runner.py
"""Inferensi ML untuk data SATU toko.

Berbeda dari `runner.py` yang melakukan inferensi dari artefak global, modul
ini menerima agregat toko dari NestJS. Training tetap terpisah: model global
(churn) hanya di-*apply* ke fitur toko, sedangkan model yang memang harus
dihitung dari deret toko (forecast, anomali) dilatih ulang pada request job
yang eksplisit - bukan setiap kali dashboard dibuka.

Semua fungsi mengembalikan bentuk yang sama dengan `InferenceRunner` supaya
UI tidak perlu tahu apakah hasilnya global atau per-toko.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

SEASON = 7
MIN_FORECAST_POINTS = 2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _as_series(series: list[dict[str, Any]]) -> pd.DataFrame:
    if not series:
        raise ValueError("Deret penjualan kosong.")
    df = pd.DataFrame(series)
    if "date" not in df.columns or "sales" not in df.columns:
        raise ValueError("Setiap titik deret wajib memiliki 'date' dan 'sales'.")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["sales"] = pd.to_numeric(df["sales"], errors="coerce").fillna(0).clip(lower=0)
    if "orders" in df.columns:
        df["orders"] = pd.to_numeric(df["orders"], errors="coerce").fillna(0).clip(lower=0)
    else:
        df["orders"] = 0.0
    df = df.dropna(subset=["date"]).groupby("date", as_index=False).agg(
        sales=("sales", "sum"), orders=("orders", "sum")
    )
    if df.empty:
        raise ValueError("Tidak ada tanggal valid pada deret penjualan.")
    # Hari tanpa transaksi = penjualan nol. Tanpa reindex, pola mingguan dan
    # rolling window akan salah karena hari sepi dianggap tidak ada.
    full = pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    df = df.set_index("date").reindex(full, fill_value=0).rename_axis("date").reset_index()
    return df


def _wape(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    mask = actual != 0
    if not mask.any():
        return None
    return float(np.abs(actual[mask] - predicted[mask]).sum() / np.abs(actual[mask]).sum())


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, Any]:
    error = actual - predicted
    mae = float(np.mean(np.abs(error))) if len(error) else 0.0
    rmse = float(math.sqrt(np.mean(error**2))) if len(error) else 0.0
    wape = _wape(actual, predicted)
    return {"mae": round(mae, 2), "rmse": round(rmse, 2), "wape": None if wape is None else round(wape, 4)}


def _seasonal_naive(train_values: np.ndarray, horizon: int) -> np.ndarray:
    season = SEASON if len(train_values) >= SEASON * 2 else 1
    pattern = train_values[-season:]
    repeats = int(math.ceil(horizon / len(pattern)))
    return np.tile(pattern, repeats)[:horizon]


def _ets_forecast(train_values: np.ndarray, horizon: int) -> np.ndarray | None:
    """Holt-Winters bila statsmodels tersedia dan datanya cukup."""
    if len(train_values) < SEASON * 2:
        return None
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        model = ExponentialSmoothing(
            train_values,
            trend="add",
            seasonal="add",
            seasonal_periods=SEASON,
            initialization_method="estimated",
        )
        fit = model.fit(optimized=True)
        return np.asarray(fit.forecast(horizon), dtype=float)
    except Exception:
        return None


def _finite(value: float, digits: int = 4) -> float | None:
    """JSON tidak mengenal `inf`/`nan`; ubah menjadi null, bukan mengarang 0."""
    number = float(value)
    if not math.isfinite(number):
        return None
    return round(number, digits)


def _future_dates(last_date: pd.Timestamp, horizon: int) -> list[str]:
    return [str((last_date + pd.Timedelta(days=i)).date()) for i in range(1, horizon + 1)]


# ---------------------------------------------------------------------------
# Forecasting
# ---------------------------------------------------------------------------

def forecast_series(series: list[dict[str, Any]], horizon_days: int = 30) -> dict[str, Any]:
    df = _as_series(series)
    n = len(df)
    if n < MIN_FORECAST_POINTS:
        raise ValueError("Forecasting membutuhkan minimal dua hari data.")
    if horizon_days < 1 or horizon_days > 90:
        raise ValueError("horizon_days harus antara 1 dan 90.")

    values = df["sales"].to_numpy(dtype=float)
    warnings: list[str] = []
    if n < 14:
        warnings.append("Histori kurang dari 14 hari; hasil belum layak untuk keputusan bisnis.")
    elif n < 60:
        warnings.append("Histori kurang dari 60 hari; prediksi jangka panjang sangat tidak pasti.")
    if horizon_days > n:
        warnings.append(
            f"Horizon {horizon_days} hari lebih panjang dari histori ({n} hari)."
        )
    if float(values.max()) == 0.0:
        raise ValueError("Semua nilai penjualan nol; tidak ada pola yang bisa diramalkan.")

    # Time-based holdout: tidak ada titik masa depan yang masuk ke training.
    holdout = min(max(SEASON, n // 5), n - 1)
    train = values[:-holdout]
    test = values[-holdout:]

    baseline_pred = _seasonal_naive(train, holdout)
    baseline_metrics = _metrics(test, baseline_pred)
    candidate_pred = _ets_forecast(train, holdout)
    candidate_metrics = _metrics(test, candidate_pred) if candidate_pred is not None else None

    chosen = "seasonal_naive"
    if candidate_metrics is not None:
        b = baseline_metrics["wape"]
        c = candidate_metrics["wape"]
        # Model kompleks hanya dipakai bila benar-benar lebih baik. Baseline
        # yang menang adalah hasil yang sah, bukan kegagalan.
        if b is None or (c is not None and c < b * 0.98):
            chosen = "ets_holt_winters"

    if chosen == "ets_holt_winters":
        prediction = _ets_forecast(values, horizon_days)
        if prediction is None:
            chosen = "seasonal_naive"
            prediction = _seasonal_naive(values, horizon_days)
    else:
        prediction = _seasonal_naive(values, horizon_days)

    residuals = test - (candidate_pred if chosen == "ets_holt_winters" and candidate_pred is not None else baseline_pred)
    residual_std = float(np.std(residuals)) if len(residuals) else float(np.std(values))
    if residual_std == 0:
        residual_std = max(1.0, float(np.mean(values)) * 0.05)

    # Interval tumbuh dengan akar horizon: ketidakpastian jangka panjang tidak
    # boleh terlihat sama sempitnya dengan satu hari ke depan.
    forecasts = []
    for index, date in enumerate(_future_dates(df["date"].iloc[-1], horizon_days)):
        value = max(0.0, float(prediction[index]))
        spread = 1.96 * residual_std * math.sqrt((index + 1) / max(1, SEASON))
        forecasts.append(
            {
                "date": date,
                "predicted": round(value, 2),
                "lower": round(max(0.0, value - spread), 2),
                "upper": round(value + spread, 2),
            }
        )

    total = float(sum(point["predicted"] for point in forecasts))
    first_week = float(sum(point["predicted"] for point in forecasts[:7]))
    last = forecasts[-1]["predicted"] if forecasts else 0.0
    first = forecasts[0]["predicted"] if forecasts else 0.0
    direction = "meningkat" if last >= first else "menurun"
    explanation = (
        f"Perkiraan omzet {horizon_days} hari ke depan adalah sekitar Rp {total:,.0f}. "
        f"Tren {direction} dibanding hari pertama periode prediksi. "
        f"Model terpilih: {chosen.replace('_', ' ')}; interval prediksi menunjukkan ketidakpastian "
        f"dan bukan jaminan hasil aktual."
    )

    chosen_metrics = candidate_metrics if chosen == "ets_holt_winters" else baseline_metrics
    return {
        "forecasts": forecasts,
        "horizon_days": horizon_days,
        "summary": {"total_predicted": round(total, 2), "first_week": round(first_week, 2)},
        "metadata": {
            "model": chosen,
            "metrics": chosen_metrics,
            "baseline": {"model": "seasonal_naive", "metrics": baseline_metrics},
            "candidate": {"model": "ets_holt_winters", "metrics": candidate_metrics},
            "holdout_days": holdout,
            "train_size": int(len(train)),
            "data_range": {"start": str(df["date"].iloc[0].date()), "end": str(df["date"].iloc[-1].date())},
        },
        "warnings": warnings,
        "explanation": explanation,
    }


# ---------------------------------------------------------------------------
# Segmentation
# ---------------------------------------------------------------------------

SEGMENT_LABELS = [
    "Pelanggan Setia (VIP)",
    "Pelanggan Potensial",
    "Pelanggan Baru",
    "Pelanggan Berisiko",
    "Segmen 5",
    "Segmen 6",
    "Segmen 7",
    "Segmen 8",
]


def _segment_recommendation(segment: str, recency: float, frequency: float) -> str:
    lowered = segment.lower()
    if "vip" in lowered or "setia" in lowered:
        return "Pertahankan dengan program loyalitas dan penawaran eksklusif."
    if "potensial" in lowered:
        return "Dorong pembelian berulang lewat bundling dan pengingat personal."
    if "baru" in lowered:
        return "Kirim onboarding dan diskon pembelian kedua."
    if "berisiko" in lowered:
        return "Lakukan reaktivasi: tawarkan insentif dan tanyakan kendala."
    if recency > 90:
        return "Pelanggan sudah lama tidak bertransaksi; prioritas kampanye reaktivasi."
    if frequency <= 1:
        return "Baru satu kali bertransaksi; dorong pembelian kedua."
    return "Pantau perilaku dan pertahankan komunikasi berkala."


def segment_customers(customers: list[dict[str, Any]]) -> dict[str, Any]:
    if not customers:
        raise ValueError("Daftar pelanggan kosong.")
    df = pd.DataFrame(customers)
    required = {"customer_id", "recency", "frequency", "monetary"}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"Kolom pelanggan tidak lengkap: {', '.join(sorted(missing))}.")

    for column in ("recency", "frequency", "monetary"):
        df[column] = pd.to_numeric(df[column], errors="coerce").fillna(0).clip(lower=0)
    df = df.drop_duplicates("customer_id").reset_index(drop=True)

    warnings: list[str] = []
    if len(df) < 5:
        warnings.append("Pelanggan kurang dari 5; segmentasi belum representatif.")
        return {
            "segments": [],
            "assignments": [],
            "metadata": {"model": "rfm+kmeans", "k": 0, "n_customers": int(len(df))},
            "warnings": warnings,
            "explanation": "Data pelanggan belum cukup untuk membentuk segmen yang bermakna.",
        }

    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import MinMaxScaler, StandardScaler

    features = df[["recency", "frequency", "monetary"]].to_numpy(dtype=float)
    scaled = StandardScaler().fit_transform(features)

    best_k, best_score = 2, -1.0
    scores: dict[int, float | None] = {}
    max_k = min(8, len(df) - 1)
    for k in range(2, max_k + 1):
        try:
            labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(scaled)
            if len(set(labels)) < 2:
                scores[k] = None
                continue
            score = float(silhouette_score(scaled, labels))
            scores[k] = score
            if score > best_score:
                best_k, best_score = k, score
        except Exception:
            scores[k] = None

    model = KMeans(n_clusters=best_k, random_state=42, n_init=10)
    df["cluster"] = model.fit_predict(scaled)

    profile = df.groupby("cluster").agg(
        recency=("recency", "mean"),
        frequency=("frequency", "mean"),
        monetary=("monetary", "mean"),
    )
    normalised = MinMaxScaler().fit_transform(profile)
    composite = (1 - normalised[:, 0]) + normalised[:, 1] + normalised[:, 2]
    order = np.argsort(composite)[::-1]
    mapping = {int(cluster): SEGMENT_LABELS[index] for index, cluster in enumerate(order)}
    df["segment"] = df["cluster"].map(mapping)

    total_revenue = float(df["monetary"].sum())
    total_customers = int(len(df))
    segments = []
    for segment, group in df.groupby("segment"):
        revenue = float(group["monetary"].sum())
        recency_avg = float(group["recency"].mean())
        frequency_avg = float(group["frequency"].mean())
        segments.append(
            {
                "segment": segment,
                "customers": int(len(group)),
                "customer_pct": round(len(group) / total_customers * 100, 1),
                "revenue": round(revenue, 2),
                "revenue_pct": round(revenue / total_revenue * 100, 1) if total_revenue else 0.0,
                "recency_avg": round(recency_avg, 1),
                "frequency_avg": round(frequency_avg, 1),
                "recommendation": _segment_recommendation(segment, recency_avg, frequency_avg),
            }
        )
    segments.sort(key=lambda item: item["revenue"], reverse=True)

    assignments = [
        {
            "customer_id": row["customer_id"],
            "segment": row["segment"],
            "recency": int(row["recency"]),
            "frequency": int(row["frequency"]),
            "monetary": round(float(row["monetary"]), 2),
        }
        for _, row in df.iterrows()
    ]

    explanation = "; ".join(
        f"{item['segment']}: {item['customers']} pelanggan ({item['customer_pct']}%), "
        f"kontribusi {item['revenue_pct']}% omzet"
        for item in segments
    )
    return {
        "segments": segments,
        "assignments": assignments,
        "metadata": {
            "model": "rfm+kmeans",
            "k": best_k,
            "best_silhouette": round(best_score, 4),
            "silhouette_by_k": scores,
            "n_customers": total_customers,
        },
        "warnings": warnings,
        "explanation": explanation + ". Label diberikan berdasarkan profil cluster, bukan nomor cluster.",
    }


# ---------------------------------------------------------------------------
# Market basket
# ---------------------------------------------------------------------------

def basket_transactions(transactions: list[dict[str, Any]], top_k: int = 20) -> dict[str, Any]:
    if len(transactions) < 2:
        raise ValueError("Market basket membutuhkan minimal dua transaksi.")
    itemsets = []
    for transaction in transactions:
        items = [str(item) for item in (transaction.get("items") or []) if str(item).strip()]
        # Duplikat dalam satu transaksi tidak menambah makna asosiasi.
        unique = list(dict.fromkeys(items))
        if len(unique) >= 2:
            itemsets.append(unique)
    if len(itemsets) < 2:
        raise ValueError("Tidak ada cukup transaksi dengan dua produk atau lebih.")

    from mlxtend.frequent_patterns import association_rules, fpgrowth
    from mlxtend.preprocessing import TransactionEncoder

    encoder = TransactionEncoder()
    matrix = encoder.fit(itemsets).transform(itemsets)
    encoded = pd.DataFrame(matrix, columns=encoder.columns_)

    warnings: list[str] = []
    n = len(itemsets)
    min_support = min(0.05, max(1.0 / n, 0.002))
    frequent = fpgrowth(encoded, min_support=min_support, use_colnames=True)
    rules = pd.DataFrame()
    if len(frequent):
        rules = association_rules(frequent, metric="lift", min_threshold=1.0)
        rules = rules[rules["confidence"] >= 0.1].sort_values("lift", ascending=False).head(top_k)

    if len(rules) == 0:
        warnings.append(
            "Tidak ada aturan yang memenuhi ambang batas. Volume atau keragaman transaksi mungkin terlalu kecil."
        )
    if n < 30:
        warnings.append("Volume transaksi kecil; aturan asosiasi tidak stabil dan bukan sebab-akibat.")

    output = []
    for _, row in rules.iterrows():
        antecedent = [str(item) for item in row["antecedents"]]
        consequent = [str(item) for item in row["consequents"]]
        output.append(
            {
                "antecedent": antecedent,
                "consequent": consequent,
                "support": round(float(row["support"]), 6),
                "confidence": round(float(row["confidence"]), 4),
                "lift": round(float(row["lift"]), 4),
                "leverage": _finite(row.get("leverage", 0), 6),
                # Conviction = inf saat confidence = 1. Itu matematis benar,
                # tetapi bukan nilai JSON yang valid - kirim null.
                "conviction": _finite(row.get("conviction", 0), 4),
                "transactions": int(round(float(row["support"]) * n)),
                "recommendation": f"Bundel {', '.join(antecedent)} dengan {', '.join(consequent)}.",
            }
        )

    return {
        "rules": output,
        "metadata": {
            "model": "fp_growth",
            "metrics": {
                "n_transactions": n,
                "n_items": len(encoder.columns_),
                "n_rules": len(output),
                "min_support": round(min_support, 6),
            },
        },
        "warnings": warnings,
        "explanation": (
            f"Ditemukan {len(output)} aturan asosiasi dari {n} transaksi. "
            "Lift > 1 berarti kombinasi lebih sering muncul daripada kebetulan; "
            "asosiasi bukan bukti sebab-akibat."
        ),
    }


# ---------------------------------------------------------------------------
# Churn (model global diterapkan ke fitur toko)
# ---------------------------------------------------------------------------

def churn_customers(model: Any, customers: list[dict[str, Any]], top_k: int = 50) -> dict[str, Any]:
    if model is None:
        raise FileNotFoundError("Model churn belum tersedia. Latih model terlebih dahulu.")
    if not customers:
        raise ValueError("Daftar pelanggan kosong.")

    df = pd.DataFrame(customers)
    missing = set(model.feature_cols).difference(df.columns)
    if missing:
        raise ValueError(f"Fitur churn tidak lengkap: {', '.join(sorted(missing))}.")

    for column in model.feature_cols:
        df[column] = pd.to_numeric(df[column], errors="coerce").fillna(0)

    features = df[model.feature_cols].to_numpy(dtype=float)
    scaled = model.scaler.transform(features)
    probabilities = model.model.predict_proba(scaled)[:, 1]

    df["churn_probability"] = probabilities
    df["risk_level"] = pd.cut(
        probabilities, bins=[-1, 0.33, 0.66, 1.0], labels=["Low", "Medium", "High"]
    ).astype(str)

    summary = df["risk_level"].value_counts().to_dict()
    summary = {level: int(summary.get(level, 0)) for level in ("Low", "Medium", "High")}

    high = df[df["risk_level"] == "High"].sort_values("churn_probability", ascending=False).head(top_k)
    importances = model.metrics.get("feature_importance", {}) or {}
    top_factors = [
        name for name, _ in sorted(importances.items(), key=lambda item: item[1], reverse=True)[:3]
    ]

    high_risk = []
    for _, row in high.iterrows():
        high_risk.append(
            {
                "customer_id": row["customer_id"],
                "churn_probability": round(float(row["churn_probability"]), 4),
                "risk_level": str(row["risk_level"]),
                "recency": int(row["recency"]),
                "frequency": int(row["frequency"]),
                "monetary": round(float(row["monetary"]), 2),
                "factors": top_factors,
                "recommendation": "Hubungi pelanggan dan tawarkan insentif reaktivasi.",
            }
        )

    warnings = [
        "Probabilitas churn adalah estimasi model, bukan kepastian. "
        "Model dilatih pada data historis global dan diterapkan pada fitur toko ini."
    ]
    if len(df) < 10:
        warnings.append("Jumlah pelanggan kecil; interpretasi risiko harus hati-hati.")

    return {
        "summary": summary,
        "high_risk_customers": high_risk,
        "metadata": {
            "model": f"churn:{model.metrics.get('chosen')}",
            "metrics": model.metrics,
            "n_customers": int(len(df)),
            "feature_importance": importances,
        },
        "warnings": warnings,
        "explanation": (
            f"Risiko tinggi: {summary['High']} pelanggan, sedang: {summary['Medium']}, "
            f"rendah: {summary['Low']}. Skor dihitung dari recency, frequency, monetary, "
            f"nilai order rata-rata, dan lama menjadi pelanggan."
        ),
    }


# ---------------------------------------------------------------------------
# Anomaly detection
# ---------------------------------------------------------------------------

def anomaly_series(series: list[dict[str, Any]], window: int = 7, z_threshold: float = 3.5) -> dict[str, Any]:
    df = _as_series(series)
    n = len(df)
    if n < 3:
        raise ValueError("Deteksi anomali membutuhkan minimal tiga hari data.")

    window = max(3, min(window, n))
    df["roll_med"] = df["sales"].rolling(window, min_periods=3).median()
    mad = lambda values: float(np.median(np.abs(values - np.median(values))))
    df["roll_mad"] = df["sales"].rolling(window, min_periods=3).apply(mad, raw=True)
    denominator = 1.4826 * df["roll_mad"]
    df["robust_z"] = (df["sales"] - df["roll_med"]) / denominator.replace(0, np.nan)

    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler

    features = df[["sales", "orders"]].fillna(0).to_numpy(dtype=float)
    scaled = StandardScaler().fit_transform(features)
    contamination = min(0.2, max(0.02, 2.0 / n))
    isolation = IsolationForest(contamination=contamination, random_state=42)
    prediction = isolation.fit_predict(scaled)
    df["iso_flag"] = (prediction == -1).astype(int)
    df["robust_flag"] = (df["robust_z"].abs() > z_threshold).astype(int)

    flagged = df[(df["robust_flag"] == 1) | (df["iso_flag"] == 1)].sort_values("date")
    anomalies = []
    for _, row in flagged.iterrows():
        baseline = float(row["roll_med"]) if pd.notna(row["roll_med"]) else None
        anomalies.append(
            {
                "date": str(row["date"].date()),
                "actual_sales": round(float(row["sales"]), 2),
                "baseline": None if baseline is None else round(baseline, 2),
                "robust_z": None if pd.isna(row["robust_z"]) else round(float(row["robust_z"]), 3),
                "type": "spike" if (baseline is None or row["sales"] > baseline) else "drop",
                "flag_source": "robust_z" if row["robust_flag"] == 1 else "isolation_forest",
            }
        )

    warnings: list[str] = []
    if n < 30:
        warnings.append("Histori kurang dari 30 hari; baseline musiman belum stabil.")
    warnings.append("Anomali hanya menandakan pola yang perlu ditinjau, bukan bukti fraud.")

    return {
        "anomalies": anomalies,
        "n_total": int(n),
        "metadata": {
            "model": "isolation_forest+robust_z",
            "metrics": {
                "n_days": int(n),
                "robust_flagged": int(df["robust_flag"].sum()),
                "iso_flagged": int(df["iso_flag"].sum()),
                "window": window,
                "z_threshold": z_threshold,
                "contamination": round(contamination, 4),
            },
        },
        "warnings": warnings,
        "explanation": (
            f"Terdeteksi {len(anomalies)} hari anomali dari {n} hari. "
            "Marker berarti pola perlu ditinjau, bukan otomatis kesalahan atau fraud."
        ),
    }
