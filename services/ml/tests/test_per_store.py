"""Test inferensi per-toko.

Test ini sengaja memanggil fungsi murni `store_runner`, bukan `main.py`,
supaya tidak bergantung pada artefak global. Yang dibuktikan: input toko
menghasilkan output dengan bentuk yang dikonsumsi dashboard.
"""
import math
from datetime import date, timedelta

import pytest

from app.inference.store_runner import (
    anomaly_series,
    basket_transactions,
    forecast_series,
    segment_customers,
)


def _series(days=60, base=100_000.0, spike_day=None, spike_value=2_000_000.0):
    start = date(2026, 1, 1)
    points = []
    for index in range(days):
        value = base + (index % 7) * 10_000
        if spike_day is not None and index == spike_day:
            value = spike_value
        points.append(
            {"date": str(start + timedelta(days=index)), "sales": value, "orders": 3}
        )
    return points


def test_forecast_per_toko_mengembalikan_horizon_yang_diminta():
    result = forecast_series(_series(40), horizon_days=7)

    assert len(result["forecasts"]) == 7
    assert all(
        set(point) == {"date", "predicted", "lower", "upper"}
        for point in result["forecasts"]
    )
    assert all(point["lower"] <= point["predicted"] <= point["upper"] for point in result["forecasts"])
    assert result["metadata"]["data_range"]["start"] == "2026-01-01"
    assert result["explanation"]


def test_forecast_menolak_horizon_di_luar_batas():
    with pytest.raises(ValueError):
        forecast_series(_series(30), horizon_days=91)


def test_segmentasi_mengelompokkan_semua_pelanggan():
    customers = []
    for index in range(12):
        customers.append(
            {
                "customer_id": f"c{index}",
                "recency": index * 5,
                "frequency": 10 - index % 5,
                "monetary": 100_000 * (index + 1),
                "tenure": 200 - index * 3,
                "avg_order_value": 50_000 + index * 1_000,
            }
        )

    result = segment_customers(customers)

    assert len(result["segments"]) >= 2
    assert sum(segment["customers"] for segment in result["segments"]) == 12
    assert len(result["assignments"]) == 12
    assert abs(sum(segment["revenue_pct"] for segment in result["segments"]) - 100) < 0.5
    assert all(segment["recommendation"] for segment in result["segments"])


def test_segmentasi_data_kecil_mengembalikan_status_belum_layak():
    result = segment_customers(
        [
            {
                "customer_id": "c1",
                "recency": 1,
                "frequency": 2,
                "monetary": 100,
                "tenure": 10,
                "avg_order_value": 50,
            }
        ]
    )
    assert result["segments"] == []
    assert result["warnings"]


def test_basket_menemukan_pasangan_produk():
    pytest.importorskip("mlxtend")
    transactions = [
        {"order_id": f"o{index}", "items": ["roti", "selai"]}
        for index in range(20)
    ] + [
        {"order_id": f"x{index}", "items": ["roti", "kopi"]}
        for index in range(5)
    ]

    result = basket_transactions(transactions, top_k=10)

    assert result["rules"]
    assert all(rule["lift"] >= 1 for rule in result["rules"])
    assert all(rule["transactions"] > 0 for rule in result["rules"])


def test_anomali_menandai_lonjakan_dengan_baseline():
    result = anomaly_series(_series(40, spike_day=30))

    assert result["n_total"] == 40
    spikes = [item for item in result["anomalies"] if item["type"] == "spike"]
    assert any(item["date"] == "2026-01-31" for item in spikes)
    assert all(math.isfinite(item["actual_sales"]) for item in result["anomalies"])
    assert any("bukan bukti fraud" in warning for warning in result["warnings"])
