import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import {
  EXCLUDED_ORDER_STATUSES,
  resolveStoreWindow,
  serializeWindow,
} from "../common/utils/store-window.js";
import ExcelJS from "exceljs";

type NormalizedForecast = {
  date: string;
  predicted: number;
  confidence: number | null;
  lower: number;
  upper: number;
  scope: "product" | "store";
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Forecast laporan berasal dari salah satu dari dua sumber nyata:
   * 1. `forecastResults` untuk forecast per produk (bila tersedia);
   * 2. hasil job ML terakhir untuk toko (forecast penjualan harian).
   *
   * Tidak ada angka contoh di sini. Kalau keduanya kosong, laporan menyatakan
   * bahwa analisis belum dijalankan - bukan menampilkan grafik palsu.
   */
  private async loadForecast(
    storeId: string,
    productId: string,
  ): Promise<{ rows: NormalizedForecast[]; scope: "product" | "store" }> {
    const stored = await this.prisma.forecastResults.findMany({
      where: { storeId, productId },
      orderBy: { forecastDate: "asc" },
      take: 30,
    });
    if (stored.length > 0) {
      return {
        scope: "product",
        rows: stored.map((row) => ({
          date: row.forecastDate.toISOString().slice(0, 10),
          predicted: Number(row.predictedQty),
          confidence: Number(row.confidence),
          lower: Number(row.lowerBound ?? row.predictedQty),
          upper: Number(row.upperBound ?? row.predictedQty),
          scope: "product" as const,
        })),
      };
    }

    const job = await this.prisma.mlJobs.findFirst({
      where: { storeId, jobType: "forecast", status: "completed" },
      orderBy: { completedAt: "desc" },
    });
    const payload = (job?.result ?? null) as Record<string, unknown> | null;
    const forecasts = Array.isArray(payload?.forecasts) ? payload.forecasts : [];
    const rows: NormalizedForecast[] = [];
    for (const item of forecasts) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as Record<string, unknown>;
      const predicted = Number(row.predicted);
      const date = typeof row.date === "string" ? row.date.slice(0, 10) : null;
      if (date === null || !Number.isFinite(predicted)) continue;
      rows.push({
        date,
        predicted,
        confidence: null,
        lower: Number.isFinite(Number(row.lower)) ? Number(row.lower) : predicted,
        upper: Number.isFinite(Number(row.upper)) ? Number(row.upper) : predicted,
        scope: "store",
      });
    }
    return { rows, scope: "store" };
  }


  async generateSalesSummaryPDF(storeId: string, period: "7d" | "30d" | "90d" = "30d"): Promise<Buffer> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const window = await resolveStoreWindow(this.prisma, storeId, days);

    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new NotFoundException("Toko tidak ditemukan.");

    const orders = await this.prisma.orders.findMany({
      where: {
        storeId,
        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
        orderDate: { gte: window.start, lte: window.end },
      },
      include: { items: true, customer: true },
    });

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrders = orders.length;
    const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);

    // Simple text-based PDF report (using Node.js buffer)
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sales Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .summary { background-color: #e8f4f8; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>Laporan Penjualan - ${store.name}</h1>
  <p>Periode: ${period === "7d" ? "7 hari" : period === "30d" ? "30 hari" : "90 hari"} (${serializeWindow(window).start} s/d ${serializeWindow(window).end})</p>
  <p>Tanggal: ${new Date().toLocaleDateString("id-ID")}</p>
  
  <div class="summary">
    <h2>Ringkasan</h2>
    <p><strong>Total Penjualan:</strong> Rp ${(totalSales / 1_000_000).toFixed(2)}jt</p>
    <p><strong>Total Pesanan:</strong> ${totalOrders}</p>
    <p><strong>Total Item:</strong> ${totalItems}</p>
    <p><strong>Rata-rata per Pesanan:</strong> Rp ${totalOrders > 0 ? (totalSales / totalOrders / 1_000_000).toFixed(2) : 0}jt</p>
  </div>

  <h2>Detail Pesanan (10 Terakhir)</h2>
  <table>
    <tr>
      <th>Tanggal</th>
      <th>Pelanggan</th>
      <th>Channel</th>
      <th>Total</th>
      <th>Item</th>
    </tr>
    ${orders
      .slice(-10)
      .reverse()
      .map(
        (o) => `
    <tr>
      <td>${o.orderDate.toLocaleDateString("id-ID")}</td>
      <td>${o.customer?.name || "-"}</td>
      <td>${o.channel || "-"}</td>
      <td>Rp ${(Number(o.total) / 1_000_000).toFixed(2)}jt</td>
      <td>${o.items.length}</td>
    </tr>
    `,
      )
      .join("")}
  </table>
</body>
</html>
    `;

    // Return HTML as buffer (browser will convert to PDF)
    return Buffer.from(html, "utf-8");
  }

  async generateDetailedExcel(storeId: string): Promise<Buffer> {
    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new NotFoundException("Toko tidak ditemukan.");

    const window = await resolveStoreWindow(this.prisma, storeId, 90);

    const orders = await this.prisma.orders.findMany({
      where: {
        storeId,
        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
        orderDate: { gte: window.start, lte: window.end },
      },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: { orderDate: "desc" },
    });

    // CSV format (can be opened in Excel)
    let csv = "Tanggal,Pesanan ID,Pelanggan,Channel,Produk,SKU,Qty,Harga,Subtotal,Total Pesanan\n";

    for (const order of orders) {
      for (const item of order.items) {
        csv += [
          order.orderDate.toLocaleDateString("id-ID"),
          order.id,
          order.customer?.name || "-",
          order.channel || "-",
          item.product?.name || "-",
          item.product?.sku || "-",
          item.qty,
          item.price,
          Number(item.qty) * Number(item.price),
          Number(order.total),
        ]
          .map((v) => `"${String(v)}"`)
          .join(",");
        csv += "\n";
      }
    }

    return Buffer.from(csv, "utf-8");
  }

  async generateForecastPDF(storeId: string, productId: string): Promise<Buffer> {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new NotFoundException("Produk tidak ditemukan pada toko ini.");

    const forecast = await this.loadForecast(storeId, productId);
    const forecasts = forecast.rows;
    const scopeLabel =
      forecast.scope === "product"
        ? `Produk ${product.name} (${product.sku})`
        : "Tingkat toko (hasil analisis ML terakhir)";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Forecast Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Forecast Penjualan</h1>
  <p>Cakupan: ${scopeLabel}</p>
  <p>Periode: ${forecasts.length} hari ke depan</p>
  <p>Tanggal: ${new Date().toLocaleDateString("id-ID")}</p>
  ${forecasts.length === 0 ? "<p><strong>Belum ada hasil forecast tersimpan.</strong> Jalankan analisis forecast terlebih dahulu dari halaman Analisis ML.</p>" : ""}

  <table>
    <tr>
      <th>Tanggal</th>
      <th>Prediksi</th>
      <th>Confidence</th>
      <th>Lower Bound</th>
      <th>Upper Bound</th>
    </tr>
    ${forecasts
      .map(
        (f) => `
    <tr>
      <td>${f.date}</td>
      <td>${f.predicted.toFixed(2)}</td>
      <td>${f.confidence === null ? "-" : `${(f.confidence * 100).toFixed(0)}%`}</td>
      <td>${f.lower.toFixed(2)}</td>
      <td>${f.upper.toFixed(2)}</td>
    </tr>
    `,
      )
      .join("")}
  </table>
</body>
</html>
    `;

    return Buffer.from(html, "utf-8");
  }


  async generateSalesSummaryXlsx(
    storeId: string,
    period: "7d" | "30d" | "90d" = "30d",
  ): Promise<Buffer> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const window = await resolveStoreWindow(this.prisma, storeId, days);

    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new NotFoundException("Toko tidak ditemukan.");

    const orders = await this.prisma.orders.findMany({
      where: {
        storeId,
        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
        orderDate: { gte: window.start, lte: window.end },
      },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: { orderDate: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet("Ringkasan");
    summary.columns = [{ header: "Metrik", key: "metric", width: 34 }, { header: "Nilai", key: "value", width: 22 }];
    summary.getRow(1).font = { bold: true };

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrderCount = orders.length;
    const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);
    const avgOrderValue = totalOrderCount > 0 ? totalSales / totalOrderCount : 0;

    summary.addRows([
      { metric: "Toko", value: store.name },
      { metric: "Periode", value: period === "7d" ? "7 hari" : period === "30d" ? "30 hari" : "90 hari" },
      { metric: "Rentang data", value: `${serializeWindow(window).start} s/d ${serializeWindow(window).end}` },
      { metric: "Tanggal laporan", value: new Date().toLocaleDateString("id-ID") },
      { metric: "Total penjualan", value: totalSales },
      { metric: "Total pesanan", value: totalOrderCount },
      { metric: "Total item", value: totalItems },
      { metric: "Rata-rata per pesanan", value: avgOrderValue },
    ]);
    summary.getCell("B6").numFmt = '#,##0';
    summary.getCell("B9").numFmt = '#,##0';

    const channels = new Map<string, { sales: number; orders: number }>();
    for (const order of orders) {
      const key = order.channel || "unknown";
      const current = channels.get(key) ?? { sales: 0, orders: 0 };
      current.sales += Number(order.total) || 0;
      current.orders += 1;
      channels.set(key, current);
    }

    const salesByChannel = workbook.addWorksheet("Penjualan per Channel");
    salesByChannel.columns = [
      { header: "Channel", key: "channel", width: 24 },
      { header: "Total Penjualan", key: "sales", width: 18 },
      { header: "Jumlah Pesanan", key: "orders", width: 18 },
    ];
    salesByChannel.getRow(1).font = { bold: true };
    let rowOffset = 2;
    for (const [channel, value] of channels.entries()) {
      salesByChannel.addRow({ channel, sales: value.sales, orders: value.orders });
      salesByChannel.getCell(`B${rowOffset}`).numFmt = '#,##0';
      rowOffset += 1;
    }

    const productSheet = workbook.addWorksheet("Penjualan per Produk");
    productSheet.columns = [
      { header: "Produk", key: "name", width: 28 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Qty Terjual", key: "qty", width: 12 },
      { header: "Total Penjualan", key: "sales", width: 18 },
    ];
    productSheet.getRow(1).font = { bold: true };
    const productTotals = new Map<string, { name: string; sku: string; qty: number; sales: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        if (!item.productId) continue;
        const current = productTotals.get(item.productId) ?? {
          name: item.product?.name || "-",
          sku: item.product?.sku || "-",
          qty: 0,
          sales: 0,
        };
        current.qty += Number(item.qty) || 0;
        current.sales += Number(item.qty) * Number(item.price);
        productTotals.set(item.productId, current);
      }
    }
    for (const value of productTotals.values()) {
      const row = productSheet.addRow({ name: value.name, sku: value.sku, qty: value.qty, sales: value.sales });
      row.getCell(3).numFmt = '#,##0';
      row.getCell(4).numFmt = '#,##0';
    }

    const recentOrders = workbook.addWorksheet("Pesanan");
    recentOrders.columns = [
      { header: "Tanggal", key: "date", width: 14 },
      { header: "Pesanan ID", key: "id", width: 28 },
      { header: "Pelanggan", key: "customer", width: 24 },
      { header: "Channel", key: "channel", width: 14 },
      { header: "Item", key: "items", width: 8 },
      { header: "Total", key: "total", width: 16 },
    ];
    recentOrders.getRow(1).font = { bold: true };
    for (const order of orders.slice(-25).reverse()) {
      const row = recentOrders.addRow({
        date: order.orderDate.toLocaleDateString("id-ID"),
        id: order.id,
        customer: order.customer?.name || "-",
        channel: order.channel || "-",
        items: order.items.length,
        total: Number(order.total) || 0,
      });
      row.getCell(6).numFmt = '#,##0';
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async generateSalesSummaryPdf(storeId: string, period: "7d" | "30d" | "90d" = "30d"): Promise<Buffer> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const window = await resolveStoreWindow(this.prisma, storeId, days);

    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new NotFoundException("Toko tidak ditemukan.");

    const orders = await this.prisma.orders.findMany({
      where: {
        storeId,
        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
        orderDate: { gte: window.start, lte: window.end },
      },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: { orderDate: "asc" },
    });

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrders = orders.length;
    const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);
    const pdfModule: any = await import("pdfkit");
    const PDFDocument = pdfModule.default;

    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).text(`Laporan Penjualan - ${store.name}`, { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(10).text(`Periode: ${period === "7d" ? "7 hari" : period === "30d" ? "30 hari" : "90 hari"} (${serializeWindow(window).start} s/d ${serializeWindow(window).end})`, { align: "center" });
      doc.text(`Tanggal: ${new Date().toLocaleDateString("id-ID")}`, { align: "center" });
      doc.moveDown(1);

      doc.fontSize(12).text("Ringkasan", { underline: true });
      doc.fontSize(10);
      doc.text(`Total penjualan: Rp ${totalSales.toLocaleString("id-ID")}`);
      doc.text(`Total pesanan: ${totalOrders}`);
      doc.text(`Total item: ${totalItems}`);
      doc.text(`Rata-rata per pesanan: Rp ${totalOrders > 0 ? (totalSales / totalOrders).toLocaleString("id-ID") : "0"}`);
      doc.moveDown(1);

      doc.fontSize(12).text("10 Pesanan Terakhir", { underline: true });
      doc.moveDown(0.3);

      const rows = ["Tanggal", "Pelanggan", "Channel", "Item", "Total"].map((header, index) => ({
        header,
        x: [50, 120, 260, 360, 430][index],
      }));
      doc.font("Helvetica-Bold").fontSize(9);
      for (const row of rows) doc.text(row.header, row.x, doc.y, { continued: true, width: 0 });
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(9);

      const recent = orders.slice(-10).reverse();
      for (const order of recent) {
        const y = doc.y;
        doc.text(order.orderDate.toLocaleDateString("id-ID"), 50, y, { width: 65 });
        doc.text(order.customer?.name || "-", 120, y, { width: 135 });
        doc.text(order.channel || "-", 260, y, { width: 95 });
        doc.text(String(order.items.length), 360, y, { width: 60 });
        doc.text(`Rp ${Number(order.total).toLocaleString("id-ID")}`, 430, y, { width: 120 });
        doc.moveDown(0.2);
      }

      doc.end();
    });
  }

  async generateDetailedXlsx(storeId: string): Promise<Buffer> {
    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new NotFoundException("Toko tidak ditemukan.");

    const window = await resolveStoreWindow(this.prisma, storeId, 90);

    const orders = await this.prisma.orders.findMany({
      where: {
        storeId,
        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
        orderDate: { gte: window.start, lte: window.end },
      },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: { orderDate: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const orderSheet = workbook.addWorksheet("Pesanan");
    orderSheet.columns = [
      { header: "Tanggal", key: "date", width: 13 },
      { header: "Pesanan ID", key: "id", width: 28 },
      { header: "Pelanggan", key: "customer", width: 24 },
      { header: "Channel", key: "channel", width: 14 },
      { header: "Total", key: "total", width: 16 },
    ];
    orderSheet.getRow(1).font = { bold: true };
    for (const order of orders) {
      const row = orderSheet.addRow({
        date: order.orderDate.toLocaleDateString("id-ID"),
        id: order.id,
        customer: order.customer?.name || "-",
        channel: order.channel || "-",
        total: Number(order.total) || 0,
      });
      row.getCell(5).numFmt = '#,##0';
    }

    const itemSheet = workbook.addWorksheet("Item Pesanan");
    itemSheet.columns = [
      { header: "Tanggal", key: "date", width: 13 },
      { header: "Pesanan ID", key: "orderId", width: 28 },
      { header: "Produk", key: "product", width: 28 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Qty", key: "qty", width: 10 },
      { header: "Harga", key: "price", width: 12 },
      { header: "Subtotal", key: "subtotal", width: 16 },
    ];
    itemSheet.getRow(1).font = { bold: true };
    for (const order of orders) {
      for (const item of order.items) {
        const row = itemSheet.addRow({
          date: order.orderDate.toLocaleDateString("id-ID"),
          orderId: order.id,
          product: item.product?.name || "-",
          sku: item.product?.sku || "-",
          qty: Number(item.qty),
          price: Number(item.price),
          subtotal: Number(item.qty) * Number(item.price),
        });
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0';
        row.getCell(7).numFmt = '#,##0';
      }
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async generateForecastPdf(storeId: string, productId: string): Promise<Buffer> {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new NotFoundException("Produk tidak ditemukan pada toko ini.");

    const forecast = await this.loadForecast(storeId, productId);
    const forecasts = forecast.rows;
    const scopeLabel =
      forecast.scope === "product"
        ? `Produk ${product.name} (${product.sku})`
        : "Tingkat toko (hasil analisis ML terakhir)";

    const pdfModule: any = await import("pdfkit");
    const PDFDocument = pdfModule.default;

    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4", layout: "landscape" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(16).text("Forecast Penjualan", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(10).text(`Cakupan: ${scopeLabel}  |  Periode: ${forecasts.length} hari  |  Tanggal: ${new Date().toLocaleDateString("id-ID")}`, { align: "center" });
      doc.moveDown(1);

      if (forecasts.length === 0) {
        doc.fontSize(10).text("Belum ada hasil forecast tersimpan. Jalankan analisis forecast terlebih dahulu.");
        doc.moveDown(1);
      }

      doc.font("Helvetica-Bold").fontSize(9);
      const headers = ["Tanggal", "Prediksi", "Confidence", "Lower", "Upper"];
      const x = [50, 170, 290, 410, 530];
      headers.forEach((header, i) => doc.text(header, x[i], doc.y, { continued: true, width: 0 }));
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(9);

      for (const forecast of forecasts) {
        const y = doc.y;
        doc.text(forecast.date, 50, y, { width: 115 });
        doc.text(forecast.predicted.toFixed(2), 170, y, { width: 115 });
        doc.text(
          forecast.confidence === null ? "-" : `${(forecast.confidence * 100).toFixed(0)}%`,
          290,
          y,
          { width: 115 },
        );
        doc.text(forecast.lower.toFixed(2), 410, y, { width: 115 });
        doc.text(forecast.upper.toFixed(2), 530, y, { width: 115 });
        doc.moveDown(0.2);
      }

      doc.end();
    });
  }
}
