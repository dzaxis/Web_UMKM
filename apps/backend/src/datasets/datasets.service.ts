import { Injectable } from "@nestjs/common";
import { parse as parseCsv } from 'csv-parse/sync';
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { PrismaService } from "../database/prisma.service.js";

const STORAGE_ROOT = path.resolve(process.cwd(), "storage", "uploads");

export type DatasetView = {
  id: string;
  storeId: string;
  uploadedById: string;
  status: string;
  fileName: string;
  fileHash: string;
  mimeType: string;
  rowCount: number;
  committedAt: Date | null;
  importedAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class DatasetsService {
  constructor(private readonly prisma: PrismaService) {}

  getStoragePath(storeId: string, absoluteFile: string): string {
    const resolved = path.resolve(absoluteFile);
    if (!resolved.startsWith(path.resolve(STORAGE_ROOT, storeId))) {
      throw new Error("Unsafe storage path");
    }
    return resolved;
  }

  async list(storeId: string): Promise<DatasetView[]> {
    const rows = await this.prisma.datasets.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row: any) => this.view(row));
  }

  async upload(
    storeId: string,
    uploadedById: string,
    file: any,
  ): Promise<DatasetView> {
    const absolute = path.resolve(file.path);
    const contents = fs.readFileSync(absolute);
    const fileHash = crypto.createHash("sha256").update(contents).digest("hex");
    // Store actual filename on disk (not original client filename)
    const storedFilename = path.basename(file.path);
    const row = await this.prisma.datasets.create({
      data: {
        storeId,
        uploadedById,
        status: "UPLOADED",
        fileName: storedFilename,
        fileHash,
        mimeType: file.mimetype,
        rowCount: 0,
      },
    });

    return this.view(row);
  }

  async get(storeId: string, id: string): Promise<DatasetView> {
    const row = await this.prisma.datasets.findFirst({
      where: { id, storeId },
    });
    if (!row) throw new Error("Not found");
    return this.view(row);
  }

  async setMapping(storeId: string, datasetId: string, mapping: Record<string, string>) {
    const dataset = await this.get(storeId, datasetId);
    await this.prisma.datasetMappings.deleteMany({ where: { datasetId: dataset.id } });
    await this.prisma.datasetMappings.create({
      data: { datasetId: dataset.id, mappingJson: mapping },
    });
    return this.view(await this.getDatasetRow(storeId, datasetId));
  }

  async getMapping(storeId: string, datasetId: string) {
    const dataset = await this.getDatasetRow(storeId, datasetId);
    const mapping = await this.prisma.datasetMappings.findFirst({
      where: { datasetId },
      orderBy: { createdAt: 'desc' },
    });
    return { mapping: mapping?.mappingJson ?? this.inferMapping([]), dataset };
  }

  async validate(storeId: string, datasetId: string) {
    const dataset = await this.getDatasetRow(storeId, datasetId);
    const mappingRow = await this.prisma.datasetMappings.findFirst({
      where: { datasetId },
      orderBy: { createdAt: 'desc' },
    });

    const filePath = path.join(STORAGE_ROOT, storeId, dataset.fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    const records = parseCsv(raw, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    const headers =
      records.length && records[0] && typeof records[0] === 'object'
        ? Object.keys(records[0] as Record<string, unknown>)
        : [];
    const mapping = (mappingRow?.mappingJson ?? this.inferMapping(headers)) as Record<string, string>;

    const required = ['order_id', 'order_date', 'customer_code', 'product_code', 'qty', 'unit_price'];
    const issues: Array<any> = [];
    const missingColumns = required.filter((key) => !mapping[key]);
    if (missingColumns.length > 0) {
      issues.push({
        severity: 'FATAL',
        code: 'MISSING_COLUMN',
        rowNumber: null,
        columnName: missingColumns.join(','),
        message: `Kolom wajib tidak ditemukan: ${missingColumns.join(', ')}`,
        count: 1,
      });
    }

    if (records.length === 0) {
      issues.push({ severity: 'WARN', code: 'EMPTY_DATASET', rowNumber: null, columnName: null, message: 'Dataset kosong', count: 1 });
    }

    let fatalCount = 0;
    for (let i = 0; i < records.length; i += 1) {
      const rawRow = records[i] as Record<string, string>;
      if (missingColumns.length > 0) {
        fatalCount += 1;
        continue;
      }
      const row = Object.fromEntries(required.map((key) => [key, rawRow[mapping[key]]]));
      const orderId = row.order_id;
      const orderDateRaw = row.order_date;
      const qty = Number(row.qty);
      const unitPrice = Number(row.unit_price);
      const total = row.total_price ? Number(mapping.total_price ? rawRow[mapping.total_price] : row.total_price) : qty * unitPrice;
      const channel = row.channel ? (mapping.channel ? rawRow[mapping.channel] : row.channel) : '';

      if (!orderId) {
        issues.push({ severity: 'FATAL', code: 'MISSING_ORDER_ID', rowNumber: i + 2, columnName: mapping.order_id, message: 'order_id kosong', count: 1 });
        fatalCount += 1;
      }
      const parsedDate = new Date(orderDateRaw);
      if (!orderDateRaw || Number.isNaN(parsedDate.getTime())) {
        issues.push({ severity: 'FATAL', code: 'INVALID_DATE', rowNumber: i + 2, columnName: mapping.order_date, message: 'tanggal tidak valid', count: 1 });
        fatalCount += 1;
      }
      if (!(row.customer_code ?? '').toString().trim()) {
        issues.push({ severity: 'FATAL', code: 'MISSING_CUSTOMER', rowNumber: i + 2, columnName: mapping.customer_code, message: 'customer_code kosong', count: 1 });
        fatalCount += 1;
      }
      if (!(row.product_code ?? '').toString().trim()) {
        issues.push({ severity: 'FATAL', code: 'MISSING_PRODUCT', rowNumber: i + 2, columnName: mapping.product_code, message: 'product_code kosong', count: 1 });
        fatalCount += 1;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        issues.push({ severity: 'FATAL', code: 'INVALID_QTY', rowNumber: i + 2, columnName: mapping.qty, message: 'qty tidak valid', count: 1 });
        fatalCount += 1;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        issues.push({ severity: 'FATAL', code: 'INVALID_PRICE', rowNumber: i + 2, columnName: mapping.unit_price, message: 'unit_price tidak valid', count: 1 });
        fatalCount += 1;
      }
      if (Number.isFinite(qty) && Number.isFinite(total) && Number.isFinite(unitPrice) && Math.abs(total - qty * unitPrice) > 1) {
        issues.push({ severity: 'AUTO_FIX', code: 'TOTAL_MISMATCH', rowNumber: i + 2, columnName: mapping.total_price ?? null, message: 'total_price diperbaiki otomatis', count: 1 });
      }
      if (channel && !['online', 'offline', 'marketplace', 'cash'].includes(channel.toLowerCase())) {
        issues.push({ severity: 'WARN', code: 'UNKNOWN_CHANNEL', rowNumber: i + 2, columnName: mapping.channel ?? null, message: 'channel tidak dikenal', count: 1 });
      }
    }

    await this.prisma.datasetIssues.deleteMany({ where: { datasetId } });
    if (issues.length > 0) {
      await this.prisma.datasetIssues.createMany({ data: issues.map((issue) => ({ ...issue, datasetId })) });
    }

    const status = fatalCount > 0 ? 'FAILED' : 'VALIDATED';
    await this.prisma.datasets.update({ where: { id: datasetId }, data: { status, rowCount: records.length } });
    return {
      ...this.view(await this.getDatasetRow(storeId, datasetId)),
      issues,
    };
  }

  async commit(storeId: string, datasetId: string) {
    const validation = await this.validate(storeId, datasetId);
    const fatalIssue = validation.issues.find((issue: any) => issue.severity === 'FATAL');
    if (fatalIssue) {
      throw new Error('DATASET_INVALID');
    }

    const dataset = await this.getDatasetRow(storeId, datasetId);
    const mappingRow = await this.prisma.datasetMappings.findFirst({
      where: { datasetId },
      orderBy: { createdAt: 'desc' },
    });
    const filePath = path.join(STORAGE_ROOT, storeId, dataset.fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    const records = parseCsv(raw, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    const headers = records.length && records[0] ? Object.keys(records[0] as any) : [];
    const mapping = ((mappingRow?.mappingJson ?? this.inferMapping(headers)) as unknown) as Record<string, string>;

    const grouped = new Map<string, any[]>();
    for (const record of records) {
      const row = record as Record<string, string>;
      const orderKey = (row[mapping.order_id] ?? 'ORD').trim();
      if (!grouped.has(orderKey)) grouped.set(orderKey, []);
      const productSku = row[mapping.product_code];
      const customerCode = row[mapping.customer_code];
      const qty = Number(row[mapping.qty]);
      const price = Number(row[mapping.unit_price]);
      const total = Number(mapping.total_price ? row[mapping.total_price] : qty * price);

      await this.prisma.$transaction(async (tx: any) => {
        const customer = await tx.customers.upsert({
          where: { storeId_code: { storeId, code: customerCode } },
          update: { name: row[mapping.customer_name] ?? customerCode, segment: null },
          create: { storeId, code: customerCode, name: row[mapping.customer_name] ?? customerCode, segment: null },
        });

        const product = await tx.products.upsert({
          where: { storeId_sku: { storeId, sku: productSku } },
          update: {
            name: row[mapping.product_name] ?? productSku,
            category: row[mapping.category] ?? null,
            unit: row[mapping.unit] ?? null,
          },
          create: {
            storeId,
            sku: productSku,
            name: row[mapping.product_name] ?? productSku,
            category: row[mapping.category] ?? null,
            unit: row[mapping.unit] ?? null,
          },
        });

        const priceExists = await tx.productPrices.findFirst({ where: { productId: product.id } });
        if (!priceExists) {
          await tx.productPrices.create({
            data: { productId: product.id, price: Number.isFinite(price) ? price : 0 },
          });
        }

        grouped.get(orderKey)!.push({
          customerId: customer.id,
          productId: product.id,
          qty: Number.isFinite(qty) ? qty : 0,
          price: Number.isFinite(price) ? price : 0,
          total: Number.isFinite(total) ? total : qty * price,
          channel: row[mapping.channel] ?? null,
        });

        return customer.id;
      });
    }

    for (const [orderKey, itemRows] of grouped.entries()) {
      const first = itemRows[0];
      const orderTotal = itemRows.reduce((sum, item) => sum + (item.total || 0), 0);
      const orderRecord = (records as Record<string, string>[]).find(
        (r) => String(r[mapping.order_id] ?? '').trim() === orderKey,
      );
      await this.prisma.orders.create({
        data: {
          storeId,
          datasetId,
          customerId: first.customerId,
          orderDate: new Date(orderRecord?.[mapping.order_date] ?? new Date()),
          channel: first.channel,
          total: orderTotal,
          items: {
            create: itemRows.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              price: item.price,
              discount: null,
            })),
          },
        },
      });
    }

    const updated = await this.prisma.datasets.update({
      where: { id: datasetId },
      data: { status: 'IMPORTED', committedAt: new Date(), importedAt: new Date() },
    });

    return this.view(updated);
  }

  async rollback(storeId: string, datasetId: string) {
    await this.getDatasetRow(storeId, datasetId);
    await this.prisma.orders.deleteMany({ where: { datasetId } });
    const updated = await this.prisma.datasets.update({
      where: { id: datasetId },
      data: { status: 'ROLLED_BACK' },
    });
    return this.view(updated);
  }

  private async getDatasetRow(storeId: string, id: string) {
    const row = await this.prisma.datasets.findFirst({ where: { id, storeId } });
    if (!row) throw new Error('Not found');
    return row;
  }

  private inferMapping(headers: string[]): Record<string, string> {
    const canonical = ['order_id', 'order_date', 'customer_code', 'customer_name', 'product_code', 'product_name', 'category', 'qty', 'unit', 'unit_price', 'total_price', 'channel'];
    const result: Record<string, string> = {};
    for (const key of canonical) {
      const match = headers.find((header) => header.toLowerCase().trim() === key || header.toLowerCase().replace(/[^a-z0-9]/g, '') === key.replace(/_/g, ''));
      if (match) result[key] = match;
    }
    return result;
  }

  private view(row: any): DatasetView {
    if (!row) throw new Error("Not found");
    return {
      id: row.id,
      storeId: row.storeId,
      uploadedById: row.uploadedById,
      status: row.status,
      fileName: row.fileName,
      fileHash: row.fileHash,
      mimeType: row.mimeType,
      rowCount: row.rowCount,
      committedAt: row.committedAt,
      importedAt: row.importedAt,
      createdAt: row.createdAt,
    };
  }
}
