import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { ReportsService } from "./reports.service.js";

type ReportPeriod = "7d" | "30d" | "90d";

function asPeriod(value: string | undefined): ReportPeriod {
  return value === "7d" || value === "90d" ? value : "30d";
}

@Controller("stores/:storeId/reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get("sales-summary")
  @StoreAccess()
  async getSalesSummary(
    @Param("storeId") storeId: string,
    @Query("period") period: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateSalesSummaryPDF(storeId, asPeriod(period));
    res.set({
      "Content-Type": "text/html",
      "Content-Disposition": `attachment; filename="sales_report_${new Date().toISOString().split("T")[0]}.html"`,
    });
    res.send(buffer);
  }

  @Get("detailed")
  @StoreAccess()
  async getDetailed(
    @Param("storeId") storeId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateDetailedExcel(storeId);
    res.set({
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="detailed_report_${new Date().toISOString().split("T")[0]}.csv"`,
    });
    res.send(buffer);
  }

  @Get("forecast/:productId")
  @StoreAccess()
  async getForecast(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateForecastPDF(storeId, productId);
    res.set({
      "Content-Type": "text/html",
      "Content-Disposition": `attachment; filename="forecast_${productId}_${new Date().toISOString().split("T")[0]}.html"`,
    });
    res.send(buffer);
  }

  @Get("sales-summary/xlsx")
  @StoreAccess()
  async getSalesSummaryXlsx(
    @Param("storeId") storeId: string,
    @Query("period") period: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateSalesSummaryXlsx(storeId, asPeriod(period));
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sales_report_${new Date().toISOString().split("T")[0]}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get("sales-summary/pdf")
  @StoreAccess()
  async getSalesSummaryPdf(
    @Param("storeId") storeId: string,
    @Query("period") period: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateSalesSummaryPdf(storeId, asPeriod(period));
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="sales_report_${new Date().toISOString().split("T")[0]}.pdf"` });
    res.send(buffer);
  }

  @Get("detailed/xlsx")
  @StoreAccess()
  async getDetailedXlsx(
    @Param("storeId") storeId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateDetailedXlsx(storeId);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="detailed_report_${new Date().toISOString().split("T")[0]}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get("forecast/:productId/pdf")
  @StoreAccess()
  async getForecastPdf(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateForecastPdf(storeId, productId);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="forecast_${productId}_${new Date().toISOString().split("T")[0]}.pdf"`,
    });
    res.send(buffer);
  }
}
