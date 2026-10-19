# app/schemas/store.py
"""Kontrak request per-toko antara NestJS dan ML Service.

Nama field sengaja snake_case dan sama dengan yang dikirim `MlDataService`,
supaya tidak ada translasi diam-diam yang bisa menggeser arti fitur.
"""
from pydantic import BaseModel, Field


class SeriesPoint(BaseModel):
    date: str = Field(min_length=4)
    sales: float = Field(ge=0)
    orders: float = Field(default=0, ge=0)


class ForecastRunInput(BaseModel):
    series: list[SeriesPoint] = Field(min_length=2)
    horizon_days: int = Field(default=30, ge=1, le=90)


class CustomerFeature(BaseModel):
    customer_id: str = Field(min_length=1)
    recency: float = Field(ge=0)
    frequency: float = Field(ge=0)
    monetary: float = Field(ge=0)
    tenure: float = Field(default=0, ge=0)
    avg_order_value: float = Field(default=0, ge=0)


class SegmentationRunInput(BaseModel):
    customers: list[CustomerFeature] = Field(min_length=2)


class ChurnRunInput(BaseModel):
    customers: list[CustomerFeature] = Field(min_length=2)
    top_k: int = Field(default=50, ge=1, le=500)


class BasketTransaction(BaseModel):
    order_id: str = Field(min_length=1)
    items: list[str] = Field(min_length=2)


class BasketRunInput(BaseModel):
    transactions: list[BasketTransaction] = Field(min_length=2)
    top_k: int = Field(default=20, ge=1, le=200)


class AnomalyRunInput(BaseModel):
    series: list[SeriesPoint] = Field(min_length=3)
