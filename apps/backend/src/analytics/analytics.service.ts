import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { RedisService } from "../cache/redis.service.js";
import {
  EXCLUDED_ORDER_STATUSES,
  eachUtcDate,
  resolveStoreWindow,
  serializeWindow,
} from "../common/utils/store-window.js";

export type SalesSummary = {
  totalSales: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  avgItemsPerOrder: number;
  period: "7d" | "30d" | "ytd";
  dataRange: {
    start: string;
    end: string;
    latestDataDate: string | null;
    hasData: boolean;
  };
};

export type SalesTrend = {
  date: string;
  sales: number;
  orderCount: number;
  itemCount: number;
};

export type TopProduct = {
  productId: string;
  sku: string;
  name: string;
  totalQty: number;
  totalRevenue: number;
  orderCount: number;
};

export type CustomerSegment = {
  segment: string;
  customerCount: number;
  totalSpent: number;
  avgSpent: number;
};

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSalesSummary(storeId: string, period: "7d" | "30d" | "ytd" = "30d"): Promise<SalesSummary> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : null;
    const window = await resolveStoreWindow(this.prisma, storeId, days);
    const cacheKey = `store:${storeId}:metric:summary:${period}:${window.latestDataDate?.toISOString() ?? "empty"}`;
    const cached = await this.redis.get<SalesSummary>(cacheKey);
    if (cached) return cached;

    // Periode dihitung dari data terakhir toko, bukan jam dinding. Dataset
    // historis yang diimpor tahun lalu tetap punya "30 hari terakhir".
    const orders = await this.prisma.orders.findMany({
      where: {
        storeId,
        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
        orderDate: { gte: window.start, lte: window.end },
      },
      include: { items: true },
    });

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrders = orders.length;
    const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);

    const result: SalesSummary = {
      totalSales,
      totalOrders,
      totalItems,
      avgOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
      avgItemsPerOrder: totalOrders > 0 ? totalItems / totalOrders : 0,
      period,
      dataRange: serializeWindow(window),
    };

    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async getSalesTrend(
    storeId: string,
    period: "7d" | "30d" | "90d" | "ytd" = "30d",
  ): Promise<SalesTrend[]> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : null;
    const window = await resolveStoreWindow(this.prisma, storeId, days);

    const orders = await this.prisma.orders.findMany({
      where: {
        storeId,
        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
        orderDate: { gte: window.start, lte: window.end },
      },
      include: { items: true },
    });

    const grouped = new Map<string, { sales: number; orderCount: number; itemCount: number }>();
    for (const order of orders) {
      const date = order.orderDate.toISOString().split("T")[0];
      if (!grouped.has(date)) {
        grouped.set(date, { sales: 0, orderCount: 0, itemCount: 0 });
      }
      const entry = grouped.get(date)!;
      entry.sales += Number(order.total) || 0;
      entry.orderCount += 1;
      entry.itemCount += order.items.length;
    }

    // Hari tanpa transaksi tetap muncul sebagai nol. Kalau hari sepi dihapus,
    // sumbu waktu bolong dan garis tren berbohong tentang jarak antar titik.
    return eachUtcDate(window.start, window.end).map((date) => {
      const entry = grouped.get(date);
      return {
        date,
        sales: entry?.sales ?? 0,
        orderCount: entry?.orderCount ?? 0,
        itemCount: entry?.itemCount ?? 0,
      };
    });
  }

  async getTopProducts(storeId: string, limit: number = 10): Promise<TopProduct[]> {
    const results = await this.prisma.orderItems.groupBy({
      by: ["productId"],
      where: {
        order: { storeId },
        productId: { not: null },
      },
      _sum: { qty: true, price: true },
      _count: { id: true },
      orderBy: { _sum: { price: "desc" } },
      take: limit,
    });

    const products = await this.prisma.products.findMany({
      where: {
        id: { in: results.map((r) => r.productId!).filter(Boolean) },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return results
      .filter((r) => r.productId)
      .map((r) => {
        const product = productMap.get(r.productId!);
        return {
          productId: r.productId!,
          sku: product?.sku || "",
          name: product?.name || "",
          totalQty: Number(r._sum.qty) || 0,
          totalRevenue: Number(r._sum.price) || 0,
          orderCount: r._count.id || 0,
        };
      });
  }

  async getCustomerSegments(storeId: string): Promise<CustomerSegment[]> {
    const customers = await this.prisma.customers.findMany({
      where: { storeId },
      include: {
        orders: {
          include: { items: true },
        },
      },
    });

    const segments = new Map<string, { customerCount: number; totalSpent: number }>();

    for (const customer of customers) {
      const spent = customer.orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const segment = customer.segment || "unclassified";

      if (!segments.has(segment)) {
        segments.set(segment, { customerCount: 0, totalSpent: 0 });
      }
      const entry = segments.get(segment)!;
      entry.customerCount += 1;
      entry.totalSpent += spent;
    }

    return Array.from(segments.entries()).map(([segment, data]) => ({
      segment,
      customerCount: data.customerCount,
      totalSpent: data.totalSpent,
      avgSpent: data.customerCount > 0 ? data.totalSpent / data.customerCount : 0,
    }));
  }

  async getInventoryStatus(storeId: string): Promise<any[]> {
    const window = await resolveStoreWindow(this.prisma, storeId, 90);
    const products = await this.prisma.products.findMany({
      where: { storeId, deletedAt: null },
      include: {
        orderItems: {
          include: { order: true },
        },
        margins: true,
      },
    });

    return products.map((p) => {
      const itemsIn90d = p.orderItems.filter(
        (oi) =>
          oi.order.orderDate >= window.start &&
          oi.order.orderDate <= window.end &&
          !EXCLUDED_ORDER_STATUSES.includes(
            oi.order.status as (typeof EXCLUDED_ORDER_STATUSES)[number],
          ),
      );
      const totalQtySold = itemsIn90d.reduce((sum, oi) => sum + Number(oi.qty), 0);
      const turnoverRate = itemsIn90d.length > 0 ? totalQtySold / 90 : 0; // avg qty per day

      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        totalQtySold90d: totalQtySold,
        orderCount90d: itemsIn90d.length,
        turnoverRate,
        marginPercent: p.margins?.marginPercent || null,
      };
    });
  }


  // ---- Phase 4 optional: advanced analytics ----

  async getProfitability(storeId: string): Promise<any> {
    const cacheKey = `store:${storeId}:metric:profitability`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const items = await this.prisma.orderItems.findMany({
      where: { order: { storeId } },
      include: { product: { include: { margins: true } } },
    });

    const byProd = new Map<string, { productId: string; name: string; sku: string; category: string | null; qty: number; revenue: number; cost: number | null; hasCost: boolean }>();
    for (const it of items) {
      if (!it.productId) continue;
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      const rev = qty * price;
      const p = it.product;
      if (!p) continue;
      if (!byProd.has(p.id)) {
        byProd.set(p.id, { productId: p.id, name: p.name, sku: p.sku, category: p.category, qty: 0, revenue: 0, cost: 0, hasCost: !!p.margins });
      }
      const e = byProd.get(p.id)!;
      e.qty += qty;
      e.revenue += rev;
      if (p.margins) {
        e.cost = (e.cost ?? 0) + qty * Number(p.margins.costPrice);
        e.hasCost = true;
      }
    }

    const byProduct = Array.from(byProd.values()).map((e) => {
      const cost = e.hasCost ? e.cost : null;
      const profit = cost !== null ? e.revenue - cost : null;
      const computedMargin =
        e.hasCost && e.revenue > 0
          ? Number(((profit! / e.revenue) * 100).toFixed(2))
          : e.hasCost
            ? 0
            : null;
      return {
        productId: e.productId,
        sku: e.sku,
        name: e.name,
        category: e.category,
        totalQtySold: e.qty,
        totalRevenue: e.revenue,
        totalCost: cost,
        grossProfit: profit,
        marginPercent: computedMargin,
      };
    }).sort((a, b) => (b.grossProfit ?? b.totalRevenue) - (a.grossProfit ?? a.totalRevenue));

    // by category
    const byCatMap = new Map<string, { category: string; totalSales: number; totalCost: number; hasCost: boolean }>();
    for (const e of byProd.values()) {
      const cat = e.category ?? "Uncategorized";
      if (!byCatMap.has(cat)) byCatMap.set(cat, { category: cat, totalSales: 0, totalCost: 0, hasCost: false });
      const c = byCatMap.get(cat)!;
      c.totalSales += e.revenue;
      if (e.hasCost) { c.totalCost += e.cost ?? 0; c.hasCost = true; }
    }
    const byCategory = Array.from(byCatMap.values()).map((c) => {
      const profit = c.hasCost ? c.totalSales - c.totalCost : null;
      const marginPercent = c.hasCost && c.totalSales > 0 ? (profit! / c.totalSales) * 100 : null;
      return {
        category: c.category,
        totalSales: c.totalSales,
        totalCost: c.hasCost ? c.totalCost : null,
        grossProfit: profit,
        marginPercent: marginPercent !== null ? Number(marginPercent.toFixed(2)) : null,
      };
    }).sort((a, b) => b.totalSales - a.totalSales);

    const totalRevenue = byProduct.reduce((s, p) => s + p.totalRevenue, 0);
    const totalCostAll = byProduct.reduce((s, p) => s + (p.totalCost ?? 0), 0);
    const hasAnyCost = byProduct.some((p) => p.totalCost !== null);
    const result = {
      byProduct,
      byCategory,
      summary: {
        totalSales: totalRevenue,
        totalCost: hasAnyCost ? totalCostAll : null,
        grossProfit: hasAnyCost ? totalRevenue - totalCostAll : null,
        marginPercent: hasAnyCost && totalRevenue > 0 ? Number((((totalRevenue - totalCostAll) / totalRevenue) * 100).toFixed(2)) : null,
      },
    };
    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async getCategoryBreakdown(storeId: string): Promise<any[]> {
    const cacheKey = `store:${storeId}:metric:category-breakdown`;
    const cached = await this.redis.get<any[]>(cacheKey);
    if (cached) return cached;

    const items = await this.prisma.orderItems.findMany({
      where: { order: { storeId } },
      include: { product: true },
    });

    const map = new Map<string, { category: string; sales: number; orderIds: Set<string>; items: number }>();
    for (const it of items) {
      const cat = it.product?.category ?? "Uncategorized";
      if (!map.has(cat)) map.set(cat, { category: cat, sales: 0, orderIds: new Set(), items: 0 });
      const e = map.get(cat)!;
      e.sales += Number(it.qty) * Number(it.price);
      e.orderIds.add(it.orderId);
      e.items += Number(it.qty);
    }
    const total = Array.from(map.values()).reduce((s, e) => s + e.sales, 0) || 1;
    const result = Array.from(map.values())
      .map((e) => ({
        category: e.category,
        sales: e.sales,
        pct: Number(((e.sales / total) * 100).toFixed(1)),
        orderCount: e.orderIds.size,
        itemCount: e.items,
      }))
      .sort((a, b) => b.sales - a.sales);
    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async getProductPerformance(storeId: string, limit: number = 20): Promise<any[]> {
    const items = await this.prisma.orderItems.findMany({
      where: { order: { storeId }, productId: { not: null } },
      include: { product: true },
    });
    const map = new Map<string, { productId: string; sku: string; name: string; category: string | null; qty: number; revenue: number; orders: Set<string> }>();
    for (const it of items) {
      if (!it.productId || !it.product) continue;
      if (!map.has(it.productId)) map.set(it.productId, { productId: it.productId, sku: it.product.sku, name: it.product.name, category: it.product.category, qty: 0, revenue: 0, orders: new Set() });
      const e = map.get(it.productId)!;
      e.qty += Number(it.qty);
      e.revenue += Number(it.qty) * Number(it.price);
      e.orders.add(it.orderId);
    }
    return Array.from(map.values())
      .map((e) => ({ productId: e.productId, sku: e.sku, name: e.name, category: e.category, totalQty: e.qty, totalRevenue: e.revenue, orderCount: e.orders.size, avgPrice: e.qty > 0 ? e.revenue / e.qty : 0 }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  async getCustomerValue(storeId: string, limit: number = 50): Promise<any[]> {
    const orders = await this.prisma.orders.findMany({
      where: { storeId },
      include: { items: true },
    });
    const map = new Map<string, { customerId: string; orderCount: number; totalRevenue: number; lastOrder: Date | null; firstOrder: Date | null }>();
    for (const o of orders) {
      if (!o.customerId) continue;
      if (!map.has(o.customerId)) map.set(o.customerId, { customerId: o.customerId, orderCount: 0, totalRevenue: 0, lastOrder: null, firstOrder: null });
      const e = map.get(o.customerId)!;
      e.orderCount += 1;
      e.totalRevenue += Number(o.total) || 0;
      if (!e.lastOrder || o.orderDate > e.lastOrder) e.lastOrder = o.orderDate;
      if (!e.firstOrder || o.orderDate < e.firstOrder) e.firstOrder = o.orderDate;
    }
    const customerIds = Array.from(map.keys());
    const [customers, window] = await Promise.all([
      this.prisma.customers.findMany({ where: { id: { in: customerIds } } }),
      resolveStoreWindow(this.prisma, storeId, null),
    ]);
    const reference = window.latestDataDate ?? new Date();
    const cMap = new Map(customers.map((c) => [c.id, c]));
    return Array.from(map.values())
      .map((e) => {
        const c = cMap.get(e.customerId);
        const recency = e.lastOrder
          ? Math.max(
              0,
              Math.floor((reference.getTime() - e.lastOrder.getTime()) / 86400000),
            )
          : null;
        return {
          customerId: e.customerId,
          name: c?.name ?? null,
          segment: c?.segment ?? null,
          orderCount: e.orderCount,
          totalRevenue: e.totalRevenue,
          avgOrderValue: e.orderCount > 0 ? e.totalRevenue / e.orderCount : 0,
          firstOrder: e.firstOrder,
          lastOrder: e.lastOrder,
          recencyDays: recency,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }
}

