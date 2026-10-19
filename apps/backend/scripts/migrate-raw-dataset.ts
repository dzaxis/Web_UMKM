import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hash } from '@node-rs/argon2';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';

const root = path.resolve(process.cwd(), '../../data/raw');
const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
const n = (v: string | undefined, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const money = (v: string | undefined) => Math.round(n(v) * 100) / 100;

async function rows(file: string) {
  return new Promise<Record<string, string>[]>((resolve, reject) => {
    const out: Record<string, string>[] = [];
    createReadStream(path.join(root, file)).pipe(parse({ columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true }))
      .on('data', (r) => out.push(r)).on('end', () => resolve(out)).on('error', reject);
  });
}

async function main() {
  const email = process.env.IMPORT_ADMIN_EMAIL ?? 'demo@bisnisinsight.local';
  const password = process.env.IMPORT_ADMIN_PASSWORD ?? 'DemoPassword123!';
  let user = await db.users.findUnique({ where: { email } });
  if (!user) user = await db.users.create({ data: { email, name: 'Demo Owner', passwordHash: await hash(password), role: 'OWNER' } });
  let store = await db.stores.findFirst({ where: { createdById: user.id, name: 'Demo UMKM Dataset' } });
  if (!store) {
    store = await db.stores.create({ data: { name: 'Demo UMKM Dataset', city: 'Jakarta', createdById: user.id, members: { create: { userId: user.id, role: 'OWNER' } } } });
  }
  const products = await rows('product_catalog.csv');
  const customers = await rows('customer_master.csv');
  const items = await rows('order_items.csv');
  const sales = await rows('ecommerce_sales_customer_analytics_150k.csv');
  const datasetPath = path.join(root, 'ecommerce_sales_customer_analytics_150k.csv');
  const fileHash = createHash('sha256').update(readFileSync(datasetPath)).digest('hex');
  const dataset = await db.datasets.upsert({ where: { id: `raw-${fileHash}` }, update: { rowCount: sales.length }, create: { id: `raw-${fileHash}`, storeId: store.id, uploadedById: user.id, status: 'IMPORTED', fileName: 'ecommerce_sales_customer_analytics_150k.csv', fileHash, mimeType: 'text/csv', rowCount: sales.length, committedAt: new Date(), importedAt: new Date() } });

  for (const r of products) await db.products.upsert({ where: { storeId_sku: { storeId: store.id, sku: r.product_id } }, update: { name: r.product_name, category: r.product_category, unit: r.product_subcategory }, create: { storeId: store.id, sku: r.product_id, name: r.product_name, category: r.product_category, unit: r.product_subcategory, prices: { create: { price: money(r.unit_price) } } } });
  for (const r of customers) await db.customers.upsert({ where: { storeId_code: { storeId: store.id, code: r.customer_id } }, update: { name: r.customer_name, segment: r.customer_segment }, create: { storeId: store.id, code: r.customer_id, name: r.customer_name, segment: r.customer_segment } });

  const byOrder = new Map<string, Record<string, string>[]>();
  for (const r of items) (byOrder.get(r.order_id) ?? (byOrder.set(r.order_id, []), byOrder.get(r.order_id)!)).push(r);
  const existing = new Set((await db.orders.findMany({ where: { storeId: store.id, datasetId: dataset.id }, select: { createdAt: true } })).map(String));
  let imported = 0;
  for (const r of sales) {
    const customer = await db.customers.findUnique({ where: { storeId_code: { storeId: store.id, code: r.customer_id } } });
    const detail = byOrder.get(r.order_id) ?? [];
    if (!customer || !detail.length) continue;
    await db.orders.create({ data: { storeId: store.id, datasetId: dataset.id, customerId: customer.id, orderDate: new Date(`${r.order_date}T${r.order_time || '00:00:00'}`), channel: r.sales_channel, total: money(r.net_sales), items: { create: detail.map((x) => ({ product: { connect: { storeId_sku: { storeId: store.id, sku: x.product_id } } }, qty: n(x.quantity), price: money(x.unit_price), discount: money(x.discount_amount) })) } } });
    imported++;
  }
  console.log(JSON.stringify({ storeId: store.id, datasetId: dataset.id, user: email, password, products: products.length, customers: customers.length, salesRows: sales.length, ordersImported: imported }, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
