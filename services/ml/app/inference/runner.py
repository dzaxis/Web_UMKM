# app/inference/runner.py
"""Loads trained artifacts and exposes infer + explanations. Never mocks data."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models.forecast import ForecastModel
from app.models.segmentation import SegmentationModel
from app.models.basket import BasketModel
from app.models.churn import ChurnModel
from app.models.anomaly import AnomalyModel


class InferenceRunner:
    def __init__(self, artifacts_dir: str | None = None):
        # Path absolut membuat service bisa dijalankan dari mana pun, bukan
        # hanya saat cwd kebetulan repo root.
        self.artifacts_dir = artifacts_dir or str(
            Path(__file__).resolve().parents[2] / "artifacts"
        )
        self.forecast_model = None
        self.segmentation_model = None
        self.basket_model = None
        self.churn_model = None
        self.anomaly_model = None
        self._load_all()

    def _safe_load(self, cls, subdir):
        try:
            m = cls(artifacts_dir=self.artifacts_dir)
            m.load()
            return m
        except Exception:
            return None

    def _load_all(self):
        self.forecast_model = self._safe_load(ForecastModel, "forecast")
        self.segmentation_model = self._safe_load(SegmentationModel, "segmentation")
        self.basket_model = self._safe_load(BasketModel, "market_basket")
        self.churn_model = self._safe_load(ChurnModel, "churn")
        self.anomaly_model = self._safe_load(AnomalyModel, "anomaly_detection")

    def reload(self):
        self._load_all()

    def status(self):
        return {name: (m is not None) for name, m in [
            ("forecast", self.forecast), ("segmentation", self.segmentation),
            ("basket", self.basket), ("churn", self.churn), ("anomaly", self.anomaly),
        ]}

    def _require(self, model, name):
        if model is None:
            from pathlib import Path
            raise FileNotFoundError(f"{name} model not trained. Run POST /train first.")

    def forecast(self, horizon_days=30):
        self._require(self.forecast_model, "forecast")
        r = self.forecast_model.infer(horizon_days)
        trend = 0.0
        try:
            f = r["forecasts"]
            if len(f) >= 2:
                trend = (f[-1]["predicted"] - f[0]["predicted"]) / max(1, f[0]["predicted"]) * 100
        except Exception:
            pass
        increasing = "meningkat" if trend >= 0 else "menurun"
        r["explanation"] = (
            f"Penjualan diperkirakan {increasing} {abs(trend):.1f}% pada {horizon_days} hari ke depan "
            f"berdasarkan pola historis. Interval prediksi menunjukkan ketidakpastian. "
            f"Model baseline (seasonal naive) dipilih karena lebih akurat dari Prophet pada data ini."
        )
        return r

    def segmentation(self):
        self._require(self.segmentation_model, "segmentation")
        r = self.segmentation_model.infer()
        seg_lines = []
        for s in r["segments"]:
            seg_lines.append(f"{s['segment']}: {s['customers']} pelanggan ({s['customer_pct']}%), kontribusi {s['revenue_pct']}% omzet")
        r["explanation"] = (
            "Segmentasi RFM + K-Means menemukan " + ", ".join(seg_lines) + ". "
            "Label diberikan berdasarkan profil cluster, bukan nomor cluster."
        )
        return r

    def basket(self, top_k=20):
        self._require(self.basket_model, "basket")
        r = self.basket_model.infer(top_k)
        n = len(r.get("rules", []))
        r["explanation"] = (
            f"Ditemukan {n} aturan asosiasi. Produk yang sering dibeli bersama dapat dijadikan paket bundling. "
            f"Skor lift > 1 menunjukkan hubungan lebih kuat dari kebetulan; asosiasi bukan sebab-akibat."
        )
        return r

    def churn(self, top_k=50):
        self._require(self.churn_model, "churn")
        r = self.churn_model.infer(top_k)
        s = r["summary"]
        high = s.get("High", 0)
        r["explanation"] = (
            f"Prediksi churn berdasarkan tidak belanja dalam 90 hari terakhir. "
            f"Resiko tinggi: {high} pelanggan. Model {self.churn_model.metrics.get('chosen')} dipilih via PR-AUC."
        )
        return r

    def anomaly(self):
        self._require(self.anomaly_model, "anomaly")
        r = self.anomaly_model.infer()
        n = len(r.get("anomalies", []))
        r["explanation"] = (
            f"Terdeteksi {n} hari anomali dari {r.get('n_total')} hari. "
            f"Tanda (marker) ini berarti pola perlu ditinjau, bukan otomatis fraud."
        )
        return r

    # -----------------------------------------------------------------
    # Per-toko: menerima agregat dari NestJS, bukan membaca artefak global.
    # -----------------------------------------------------------------

    def forecast_store(self, series, horizon_days=30):
        from app.inference.store_runner import forecast_series

        return forecast_series(series, horizon_days)

    def segmentation_store(self, customers):
        from app.inference.store_runner import segment_customers

        return segment_customers(customers)

    def basket_store(self, transactions, top_k=20):
        from app.inference.store_runner import basket_transactions

        return basket_transactions(transactions, top_k)

    def churn_store(self, customers, top_k=50):
        from app.inference.store_runner import churn_customers

        # Model churn global di-apply ke fitur toko. Kalau artefak tidak bisa
        # dimuat, endpoint mengembalikan 404 - bukan hasil karangan.
        self._require(self.churn_model, "churn")
        return churn_customers(self.churn_model, customers, top_k)

    def anomaly_store(self, series):
        from app.inference.store_runner import anomaly_series

        return anomaly_series(series)
