# app/models/forecast.py
"""Sales forecasting: Prophet + seasonal-naive baseline; rolling-origin holdout eval."""
import json
from pathlib import Path
import joblib
import pandas as pd
import numpy as np

from app.core.config import settings
from app.preprocessing.loader import daily_sales


class ForecastModel:
    def __init__(self, artifacts_dir=None):
        self.artifacts_dir = Path(artifacts_dir or settings.ARTIFACTS_DIR) / "forecasting/v1"
        self.model = None
        self.history = None
        self.metrics = {}

    def train(self, df, holdout_days=30):
        # Import lazy: Prophet berat dan tidak dibutuhkan untuk membaca
        # artefak lama / menjalankan model per-toko berbasis baseline.
        from prophet import Prophet

        ds = daily_sales(df)
        ds = ds.sort_values("date").reset_index(drop=True)
        # holdout: last `holdout_days` as test
        train_ds = ds.iloc[:-holdout_days]
        test_ds = ds.iloc[-holdout_days:]

        # Prophet
        p_train = train_ds[["date", "sales"]].rename(columns={"date": "ds", "sales": "y"})
        m = Prophet(interval_width=0.95, daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=False)
        m.fit(p_train)
        fut = m.make_future_dataframe(periods=holdout_days)
        fc = m.predict(fut).tail(holdout_days)
        yhat = fc["yhat"].values
        ytrue = test_ds["sales"].values
        # naive baseline
        naive_last = train_ds["sales"].iloc[-1]
        naive_pred = np.full_like(ytrue, naive_last, dtype=float)
        from evaluation.metrics import forecast_metrics
        p_metrics = forecast_metrics(ytrue, yhat)
        n_metrics = forecast_metrics(ytrue, naive_pred)
        chosen = "prophet" if p_metrics["wape"] <= n_metrics["wape"] else "seasonal_naive"

        # final model fit on ALL data
        full = ds[["date", "sales"]].rename(columns={"date": "ds", "sales": "y"})
        final = Prophet(interval_width=0.95, daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=False)
        final.fit(full)
        self.model = final
        self.history = ds
        self.metrics = {
            "prophet": p_metrics,
            "seasonal_naive": n_metrics,
            "chosen": chosen,
            "holdout_days": holdout_days,
            "train_size": len(train_ds),
        }
        return self.metrics

    def infer(self, horizon_days=30):
        if self.model is None:
            self.load()
        m = self.model
        future = m.make_future_dataframe(periods=horizon_days)
        fc = m.predict(future).tail(horizon_days)
        out = []
        for _, r in fc.iterrows():
            out.append({
                "date": str(r["ds"].date()),
                "predicted": float(max(0, r["yhat"])),
                "lower": float(max(0, r["yhat_lower"])),
                "upper": float(max(0, r["yhat_upper"])),
            })
        return {
            "forecasts": out,
            "horizon_days": horizon_days,
            "metadata": {"model": "prophet+seasonal_naive", "chosen": self.metrics.get("chosen"), "metrics": self.metrics},
        }

    def save(self):
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump({"model": self.model, "history": self.history, "metrics": self.metrics}, self.artifacts_dir / "model.pkl")
        (self.artifacts_dir / "metadata.json").write_text(json.dumps(self.metrics, indent=2))

    def load(self):
        p = self.artifacts_dir / "model.pkl"
        if not p.exists():
            raise FileNotFoundError("forecast model not trained")
        obj = joblib.load(p)
        self.model = obj["model"]
        self.history = obj["history"]
        self.metrics = obj["metrics"]
