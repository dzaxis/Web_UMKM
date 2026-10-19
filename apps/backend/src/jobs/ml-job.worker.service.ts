// src/jobs/ml-job.worker.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { MlClientService } from "../ml/ml-client.service.js";
import { MlDataService } from "../ml/ml-data.service.js";
import { MlJobService } from "./ml-job.service.js";
import { RedisService } from "../cache/redis.service.js";

@Injectable()
export class MlJobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MlJobWorkerService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mlClient: MlClientService,
    private readonly mlData: MlDataService,
    private readonly jobService: MlJobService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.interval = setInterval(() => void this.tick(), 5_000);
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async tick() {
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      await this.prisma.mlJobs.updateMany({
        where: { status: "running", startedAt: { lt: tenMinAgo } },
        data: { status: "failed", errorMessage: "Job timeout (>10 minutes)", completedAt: new Date() },
      });
    } catch (e) {
      // Database bisa sedang restart. Jangan biarkan interval melempar
      // unhandled rejection hanya karena satu tick gagal.
      this.logger.warn(`timeout sweep skipped: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    let job: any = null;
    try {
      job = await this.prisma.$transaction(async (tx: any) => {
        const rows: any[] = await tx.$queryRaw`
          SELECT id FROM ml_jobs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;
        if (!rows || !rows.length) return null;
        const id = rows[0].id as string;
        await tx.mlJobs.update({
          where: { id },
          data: { status: "running", workerId: process.pid.toString(), startedAt: new Date() },
        });
        return await tx.mlJobs.findUnique({ where: { id } });
      });
    } catch (e) {
      this.logger.warn(`lock/select failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    if (!job) return;

    try {
      const result = await this.execute(job);
      await this.jobService.complete(job.id, result);
      await this.redis.invalidateStoreMetrics(job.storeId);
      this.logger.debug(`job ${job.id} completed`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.jobService.fail(job.id, msg);
      this.logger.error(`job ${job.id} failed: ${msg}`);
    }
  }

  private async execute(job: any) {
    const params = (job.inputParams as any) ?? {};
    let result: any;
    let warnings: string[] = [];

    switch (job.jobType) {
      case "forecast": {
        const input = await this.mlData.forecastInput(job.storeId);
        warnings = input.warnings;
        result = await this.mlClient.forecastFromSeries(
          input.series,
          params.horizonDays ?? params.horizon_days ?? 30,
        );
        result = {
          ...result,
          data_range: { start: input.series[0]?.date ?? null, end: input.series.at(-1)?.date ?? null },
        };
        break;
      }
      case "segmentation": {
        const input = await this.mlData.segmentationInput(job.storeId);
        warnings = input.warnings;
        result = await this.mlClient.segmentationFromCustomers(input.customers);
        break;
      }
      case "market-basket":
      case "basket": {
        const input = await this.mlData.basketInput(job.storeId);
        warnings = input.warnings;
        result = await this.mlClient.basketFromTransactions(
          input.transactions,
          params.topK ?? params.top_k ?? 20,
        );
        break;
      }
      case "churn": {
        const input = await this.mlData.churnInput(job.storeId);
        warnings = input.warnings;
        result = await this.mlClient.churnFromCustomers(
          input.customers,
          params.topK ?? params.top_k ?? 50,
        );
        break;
      }
      case "anomaly": {
        const input = await this.mlData.anomalyInput(job.storeId);
        warnings = input.warnings;
        result = await this.mlClient.anomalyFromSeries(input.series);
        result = {
          ...result,
          data_range: { start: input.series[0]?.date ?? null, end: input.series.at(-1)?.date ?? null },
        };
        break;
      }
      default:
        throw new Error(`Unknown jobType: ${job.jobType}`);
    }

    const mlWarnings = Array.isArray(result?.warnings) ? result.warnings : [];
    const extraWarnings: string[] = [];

    // Segmentasi baru berguna kalau labelnya tersimpan. Tanpa langkah ini,
    // customer.segment tetap null dan ekspor per segmen selalu kosong.
    if (job.jobType === "segmentation") {
      const assignments: Array<{ customerId: string; segment: string }> = [];
      for (const item of Array.isArray(result?.assignments) ? result.assignments : []) {
        if (typeof item !== "object" || item === null) continue;
        const row = item as Record<string, unknown>;
        if (typeof row.customer_id !== "string" || typeof row.segment !== "string") continue;
        assignments.push({ customerId: row.customer_id, segment: row.segment.slice(0, 191) });
      }
      if (assignments.length > 0) {
        try {
          // Bagi per 500 agar transaksi tidak membengkak untuk toko besar.
          for (let index = 0; index < assignments.length; index += 500) {
            const chunk = assignments.slice(index, index + 500);
            await this.prisma.$transaction(
              chunk.map((assignment) =>
                this.prisma.customers.updateMany({
                  where: { id: assignment.customerId, storeId: job.storeId },
                  data: { segment: assignment.segment },
                }),
              ),
            );
          }
        } catch (e) {
          extraWarnings.push(
            `Label segmen gagal disimpan: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    return {
      ...result,
      store_id: job.storeId,
      analyzed_at: new Date().toISOString(),
      warnings: [...new Set([...warnings, ...mlWarnings, ...extraWarnings])],
    };
  }
}
