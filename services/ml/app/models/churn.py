# app/models/churn.py
"""Churn prediction: XGBoost vs RF, churn = no purchase in last 90 days, time-based."""
import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier

from app.core import config as cfg
from app.preprocessing.loader import rfm_table


class ChurnModel:
    def __init__(self, artifacts_dir=None, horizon_days=90):
        self.artifacts_dir = Path(artifacts_dir or cfg.settings.ARTIFACTS_DIR) / "churn/v1"
        self.horizon_days = horizon_days
        self.model = None
        self.scaler = None
        self.feature_cols = ["recency", "frequency", "monetary", "avg_order_value", "tenure"]
        self.metrics = {}
        self.reference_date = None
        self.predictions = None

    def _build_features_labels(self, df):
        d = df.copy()
        d["order_date"] = pd.to_datetime(d["order_date"], errors="coerce")
        max_date = d["order_date"].max()
        self.reference_date = str(max_date.date())
        cutoff = max_date - pd.Timedelta(days=self.horizon_days)
        # labels from full data (any purchase after cutoff = not churn)
        last_order = d.groupby("customer_id")["order_date"].max()
        churn_series = (last_order < cutoff).astype(int)
        # features from history up to cutoff (avoid leakage)
        history = d[d["order_date"] <= cutoff]
        ref_for_features = cutoff + pd.Timedelta(days=1)
        if len(history) == 0:
            raise ValueError("not enough history for churn model")
        rfm = rfm_table(history, reference_date=ref_for_features)
        rfm = rfm.set_index("customer_id")
        rfm["churn"] = churn_series.reindex(rfm.index).fillna(0).astype(int)
        return rfm.reset_index(), max_date

    def train(self, df, test_size=0.2):
        from xgboost import XGBClassifier

        data, max_date = self._build_features_labels(df)
        X = data[self.feature_cols].fillna(0).to_numpy(dtype=float)
        y = data["churn"].to_numpy()
        Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=test_size, random_state=cfg.settings.RANDOM_STATE, stratify=y if len(set(y)) > 1 else None)

        scaler = StandardScaler()
        Xtrs = scaler.fit_transform(Xtr)
        Xtes = scaler.transform(Xte)

        xgb = XGBClassifier(n_estimators=150, max_depth=4, learning_rate=0.1, random_state=cfg.settings.RANDOM_STATE, eval_metric="logloss")
        rf = RandomForestClassifier(n_estimators=200, random_state=cfg.settings.RANDOM_STATE)
        xgb.fit(Xtrs, ytr)
        rf.fit(Xtrs, ytr)
        xgb_proba = xgb.predict_proba(Xtes)[:, 1]
        rf_proba = rf.predict_proba(Xtes)[:, 1]
        def metrics(y_true, y_pred, y_proba):
            from sklearn.metrics import precision_recall_curve, auc, f1_score, recall_score
            pr, rc, _ = precision_recall_curve(y_true, y_proba)
            pr_auc = auc(rc, pr)
            return {
                "pr_auc": float(pr_auc),
                "f1": float(f1_score(y_true, y_pred, zero_division=0)),
                "recall_high_risk": float(recall_score(y_true, y_pred, pos_label=1, zero_division=0)),
            }
        xm = metrics(yte, (xgb_proba >= 0.5).astype(int), xgb_proba)
        rm = metrics(yte, (rf_proba >= 0.5).astype(int), rf_proba)
        if xm["pr_auc"] >= rm["pr_auc"]:
            self.model = xgb; chosen = "xgboost"
            test_metrics = xm
        else:
            self.model = rf; chosen = "random_forest"
            test_metrics = rm
        self.scaler = scaler
        self.metrics = {
            "chosen": chosen,
            "xgboost": xm,
            "random_forest": rm,
            "test_size": test_size,
            "n_train": int(len(Xtr)),
            "n_test": int(len(Xte)),
            "churn_rate": float(y.mean()),
            "feature_cols": self.feature_cols,
            "reference_date": self.reference_date,
            "horizon_days": self.horizon_days,
        }
        self.metrics["test_metrics"] = test_metrics
        if hasattr(self.model, "feature_importances_"):
            self.metrics["feature_importance"] = {c: float(v) for c, v in zip(self.feature_cols, self.model.feature_importances_)}

        # predictions for ALL customers as of latest reference
        final_rfm = rfm_table(df if isinstance(df, pd.DataFrame) else None, reference_date=max_date + pd.Timedelta(days=1)) if True else None
        final_rfm = rfm_table(df, reference_date=max_date + pd.Timedelta(days=1))
        Xall = final_rfm[self.feature_cols].fillna(0).to_numpy(dtype=float)
        Xalls = scaler.transform(Xall)
        proba = self.model.predict_proba(Xalls)[:, 1]
        final_rfm = final_rfm.copy()
        final_rfm["churn_probability"] = proba
        final_rfm["risk_level"] = pd.cut(proba, bins=[-1, 0.33, 0.66, 1.0], labels=["Low", "Medium", "High"])
        self.predictions = final_rfm[["customer_id", "churn_probability", "risk_level", "recency", "frequency", "monetary"]]
        return self.metrics

    def infer(self, top_k=50):
        if self.predictions is None:
            self.load()
        df = self.predictions
        high = df[df["risk_level"] == "High"].head(top_k)
        risk_counts = df["risk_level"].value_counts().to_dict()
        return {
            "summary": {str(k): int(v) for k, v in risk_counts.items()},
            "high_risk_customers": [
                {"customer_id": r["customer_id"], "churn_probability": float(r["churn_probability"]), "risk_level": str(r["risk_level"]), "recency": int(r["recency"]), "frequency": int(r["frequency"]), "monetary": float(r["monetary"])} for _, r in high.iterrows()
            ],
            "metadata": {"model": f"churn:{self.metrics.get('chosen')}", "metrics": self.metrics},
        }

    def save(self):
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump({"model": self.model, "scaler": self.scaler, "metrics": self.metrics, "predictions": self.predictions, "reference_date": self.reference_date, "feature_cols": self.feature_cols, "horizon_days": self.horizon_days}, self.artifacts_dir / "model.pkl")
        (self.artifacts_dir / "metadata.json").write_text(json.dumps(self.metrics, indent=2, default=str))

    def load(self):
        p = self.artifacts_dir / "model.pkl"
        if not p.exists():
            raise FileNotFoundError("churn model not trained")
        obj = joblib.load(p)
        self.model = obj["model"]; self.scaler = obj["scaler"]; self.metrics = obj["metrics"]
        self.predictions = obj["predictions"]; self.reference_date = obj["reference_date"]
        self.feature_cols = obj["feature_cols"]; self.horizon_days = obj["horizon_days"]
