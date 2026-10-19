import { Controller, Get, Param, Query, Post, HttpCode, Body, BadRequestException } from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { AnalyticsService } from "./analytics.service.js";
import { MlJobService } from "../jobs/ml-job.service.js";

const ML_JOB_TYPES = new Set([
  "forecast",
  "segmentation",
  "market-basket",
  "basket",
  "churn",
  "anomaly",
]);

@Controller("stores/:storeId/analytics")
export class AnalyticsController {
  constructor(
    private readonly service: AnalyticsService,
    private readonly mlJobs: MlJobService,
  ) {}

  @Get("summary")
  @StoreAccess()
  async getSummary(
    @Param("storeId") storeId: string,
    @Query("period") period: "7d" | "30d" | "ytd" = "30d",
  ) {
    return {
      data: await this.service.getSalesSummary(storeId, period),
    };
  }

  @Get("trend")
  @StoreAccess()
  async getTrend(
    @Param("storeId") storeId: string,
    @Query("period") period: "7d" | "30d" | "90d" | "ytd" = "30d",
  ) {
    return {
      data: await this.service.getSalesTrend(storeId, period),
    };
  }

  @Get("top-products")
  @StoreAccess()
  async getTopProducts(@Param("storeId") storeId: string, @Query("limit") limit: string = "10") {
    return {
      data: await this.service.getTopProducts(storeId, parseInt(limit, 10)),
    };
  }

  @Get("customer-segments")
  @StoreAccess()
  async getCustomerSegments(@Param("storeId") storeId: string) {
    return {
      data: await this.service.getCustomerSegments(storeId),
    };
  }

  @Get("inventory")
  @StoreAccess()
  async getInventory(@Param("storeId") storeId: string) {
    return {
      data: await this.service.getInventoryStatus(storeId),
    };
  }

  // Phase 4: async analysis job submission
  //
  // Hanya OWNER yang boleh menjalankan analisis. Pegawai bersifat read-only
  // untuk hasil analitik (Promt §5.3); memberi mereka akses POST akan membuat
  // batas peran itu hanya kosmetik di UI.
  @Post("run")
  @HttpCode(202)
  @StoreAccess("OWNER")
  async runAnalysis(
    @Param("storeId") storeId: string,
    @Body()
    body: {
      jobType: string;
      parameters?: Record<string, any>;
      idempotencyKey?: string;
    },
  ) {
    if (!body?.jobType || !ML_JOB_TYPES.has(body.jobType)) {
      throw new BadRequestException(
        `jobType tidak dikenal. Pilihan: ${[...ML_JOB_TYPES].join(", ")}.`,
      );
    }
    if (body.parameters != null && typeof body.parameters !== "object") {
      throw new BadRequestException("parameters harus berupa objek.");
    }
    const job = await this.mlJobs.createJob(storeId, body.jobType, body.parameters ?? {}, body.idempotencyKey);
    return {
      data: {
        jobId: job.id,
        status: job.status,
        createdAt: job.createdAt,
        message: "Analisis sedang diproses. Periksa status menggunakan jobId ini.",
      },
    };
  }

  // Phase 4: job status polling
  @Get("jobs/:jobId")
  @StoreAccess()
  async getJobStatus(@Param("storeId") storeId: string, @Param("jobId") jobId: string) {
    const job = await this.mlJobs.getJob(storeId, jobId);
    let result = job.result;
    let explanation: string | null = null;
    if (result && typeof result === "object" && "explanation" in result) {
      explanation = (result as any).explanation ?? null;
    }
    return {
      data: {
        jobId: job.id,
        status: job.status,
        jobType: job.jobType,
        inputParams: job.inputParams,
        result: result ?? null,
        explanation,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    };
  }

  @Get("jobs")
  @StoreAccess()
  async listJobs(
    @Param("storeId") storeId: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const data = await this.mlJobs.listJobs(storeId, status, limit ? Number(limit) : 50, offset ? Number(offset) : 0);
    return { data };
  }
  @Get("profitability")
  @StoreAccess()
  async getProfitability(@Param("storeId") storeId: string) {
    return { data: await this.service.getProfitability(storeId) };
  }

  @Get("category-breakdown")
  @StoreAccess()
  async getCategoryBreakdown(@Param("storeId") storeId: string) {
    return { data: await this.service.getCategoryBreakdown(storeId) };
  }

  @Get("product-performance")
  @StoreAccess()
  async getProductPerformance(@Param("storeId") storeId: string, @Query("limit") limit: string = "20") {
    return { data: await this.service.getProductPerformance(storeId, parseInt(limit, 10)) };
  }

  @Get("customer-value")
  @StoreAccess()
  async getCustomerValue(@Param("storeId") storeId: string, @Query("limit") limit: string = "50") {
    return { data: await this.service.getCustomerValue(storeId, parseInt(limit, 10)) };
  }
}
