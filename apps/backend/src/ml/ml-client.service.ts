// src/ml/ml-client.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type MlResult = any;

/**
 * Error dari FastAPI yang TIDAK layak diulang (4xx: payload/permission).
 * Dipisahkan supaya loop retry tidak memanggil ulang kesalahan yang sama.
 */
class MlRequestError extends Error {}

@Injectable()
export class MlClientService {
  private readonly logger = new Logger(MlClientService.name);
  private failures = 0;
  private state: "closed" | "open" | "half_open" = "closed";
  private lastFailure = 0;

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return (this.config.get<string>("ML_SERVICE_URL") ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  }

  private async call(path: string, body?: any, timeoutMs = 300_000): Promise<MlResult> {
    // circuit breaker
    if (this.state === "open" && Date.now() - this.lastFailure < 60_000) {
      throw new Error("ML service unavailable (circuit open)");
    }
    if (this.state === "open") this.state = "half_open";

    const url = `${this.baseUrl()}${path}`;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: body ? "POST" : "GET",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          // FastAPI mengirim detail validasi di body. Tanpa ini, satu-satunya
          // petunjuk hanyalah "422" dan penyebabnya tidak bisa didiagnosis
          // dari job yang gagal.
          const detail = (await res.text()).slice(0, 1000);
          const message = `ML ${path} failed: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}`;
          if (res.status < 500) {
            // 4xx = payload tidak valid; mengulang tidak akan berubah.
            this.failures = 0;
            this.state = "closed";
            throw new MlRequestError(message);
          }
          throw new Error(message);
        }
        const json = await res.json();
        this.failures = 0;
        this.state = "closed";
        return json;
      } catch (e) {
        clearTimeout(timer);
        if (e instanceof MlRequestError) throw e;
        lastErr = e instanceof Error ? e : new Error(String(e));
        this.logger.warn(`ML call attempt ${attempt + 1} failed: ${lastErr.message}`);
      }
    }
    this.failures += 1;
    this.lastFailure = Date.now();
    if (this.failures > 3) this.state = "open";
    throw lastErr ?? new Error("ML call failed");
  }

  async forecast(horizonDays = 30) {
    return this.call("/forecast", { horizon_days: horizonDays });
  }

  async segmentation() {
    return this.call("/segmentation", {});
  }

  async basket(topK = 20) {
    return this.call(`/basket?top_k=${topK}`);
  }

  async churn(topK = 50) {
    return this.call(`/churn?top_k=${topK}`);
  }

  async anomaly() {
    return this.call("/anomaly", {});
  }

  // ---------------------------------------------------------------------
  // Per-toko: data toko dikirim eksplisit, bukan memakai deret global
  // yang tersimpan di artefak. Ini yang membuat hasil ML benar-benar
  // berasal dari transaksi toko yang sedang dianalisis.
  // ---------------------------------------------------------------------

  async forecastFromSeries(series: Array<{ date: string; sales: number; orders?: number }>, horizonDays = 30) {
    return this.call("/forecast/run", { series, horizon_days: horizonDays });
  }

  async segmentationFromCustomers(
    customers: Array<{
      customer_id: string;
      recency: number;
      frequency: number;
      monetary: number;
      tenure: number;
      avg_order_value: number;
    }>,
  ) {
    return this.call("/segmentation/run", { customers });
  }

  async basketFromTransactions(transactions: Array<{ order_id: string; items: string[] }>, topK = 20) {
    return this.call("/basket/run", { transactions, top_k: topK });
  }

  async churnFromCustomers(
    customers: Array<{
      customer_id: string;
      recency: number;
      frequency: number;
      monetary: number;
      tenure: number;
      avg_order_value: number;
    }>,
    topK = 50,
  ) {
    return this.call("/churn/run", { customers, top_k: topK });
  }

  async anomalyFromSeries(series: Array<{ date: string; sales: number; orders?: number }>) {
    return this.call("/anomaly/run", { series });
  }

  async health() {
    return this.call("/health", undefined, 5_000);
  }
}
