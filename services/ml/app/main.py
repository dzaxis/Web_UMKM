# app/main.py
"""FastAPI ML service - 5 models, inference only against persisted artifacts."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from app.inference.runner import InferenceRunner
from app.schemas.store import (
    AnomalyRunInput,
    BasketRunInput,
    ChurnRunInput,
    ForecastRunInput,
    SegmentationRunInput,
)

app = FastAPI(title="BisnisInsight ML Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class HorizonInput(BaseModel):
    horizon_days: int = Field(default=30, ge=1, le=90)


runner = InferenceRunner()


@app.get("/health")
def health():
    return {"status": "ok", "models": runner.status()}


@app.post("/train")
def train():
    from training.train_all import main as _train
    try:
        _train()
        runner.reload()
        return {"status": "trained", "models": runner.status()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/forecast")
def forecast(inp: HorizonInput = HorizonInput()):
    try:
        return runner.forecast(inp.horizon_days)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/segmentation")
def segmentation():
    try:
        return runner.segmentation()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/basket")
def basket(top_k: int = 20):
    try:
        return runner.basket(top_k)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/churn")
def churn(top_k: int = 50):
    try:
        return runner.churn(top_k)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/anomaly")
def anomaly():
    try:
        return runner.anomaly()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Per-toko. NestJS mengirim agregat yang sudah ter-scope ke satu storeId.
# ---------------------------------------------------------------------------

def _run(fn):
    try:
        return fn()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/forecast/run")
def forecast_run(inp: ForecastRunInput):
    return _run(
        lambda: runner.forecast_store(
            [point.model_dump() for point in inp.series], inp.horizon_days
        )
    )


@app.post("/segmentation/run")
def segmentation_run(inp: SegmentationRunInput):
    return _run(
        lambda: runner.segmentation_store([point.model_dump() for point in inp.customers])
    )


@app.post("/basket/run")
def basket_run(inp: BasketRunInput):
    return _run(
        lambda: runner.basket_store(
            [transaction.model_dump() for transaction in inp.transactions], inp.top_k
        )
    )


@app.post("/churn/run")
def churn_run(inp: ChurnRunInput):
    return _run(
        lambda: runner.churn_store(
            [point.model_dump() for point in inp.customers], inp.top_k
        )
    )


@app.post("/anomaly/run")
def anomaly_run(inp: AnomalyRunInput):
    return _run(
        lambda: runner.anomaly_store([point.model_dump() for point in inp.series])
    )
