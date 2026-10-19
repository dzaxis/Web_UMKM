import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/database/prisma.service.js";
import { buildTestApp } from "./utils/test-app.js";

const VALID_PASSWORD = "rahasia-kuat-123";
let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await buildTestApp();
  prisma = app.get(PrismaService);
});

async function cleanup() {
  await prisma.orderItems.deleteMany({});
  await prisma.orders.deleteMany({});
  await prisma.productPrices.deleteMany({});
  await prisma.products.deleteMany({});
  await prisma.customers.deleteMany({});
  await prisma.datasetIssues.deleteMany({});
  await prisma.datasetMappings.deleteMany({});
  await prisma.datasets.deleteMany({});
  await prisma.auditLogs.deleteMany({});
  await prisma.refreshTokens.deleteMany({});
  await prisma.storeInvites.deleteMany({});
  await prisma.storeMembers.deleteMany({});
  await prisma.stores.deleteMany({});
  await prisma.users.deleteMany({});
}

afterAll(async () => {
  await cleanup();
  await app.close();
});

beforeEach(async () => {
  await cleanup();
});

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

describe("catalog and manual order", () => {
  it("creates product and manual order", async () => {
    const email = uniqueEmail("owner");
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({ name: "Owner", email, password: VALID_PASSWORD }).expect(201);
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password: VALID_PASSWORD }).expect(201);
    const token = login.body.data.accessToken;
    const store = await request(app.getHttpServer()).post("/api/v1/stores").set("Authorization", `Bearer ${token}`).send({ name: "Toko Test", city: "Bandung" }).expect(201);
    const storeId = store.body.data.id;

    const product = await request(app.getHttpServer()).post(`/api/v1/stores/${storeId}/products`).set("Authorization", `Bearer ${token}`).send({ sku: "P1", name: "Teh Botol", category: "Minuman", unit: "botol" }).expect(201);
    expect(product.body.data.sku).toBe("P1");
    const list = await request(app.getHttpServer()).get(`/api/v1/stores/${storeId}/products`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(list.body.data).toHaveLength(1);

    await request(app.getHttpServer()).post(`/api/v1/stores/${storeId}/customers`).set("Authorization", `Bearer ${token}`).send({ code: "C1", name: "Ridho" }).expect(201);

    const order = await request(app.getHttpServer()).post(`/api/v1/stores/${storeId}/orders/manual`).set("Authorization", `Bearer ${token}`).send({
      customerCode: "C1",
      orderDate: "2026-01-01",
      channel: "online",
      items: [{ productSku: "P1", qty: 2, price: 3000 }],
    }).expect(201);

    const orders = await request(app.getHttpServer()).get(`/api/v1/stores/${storeId}/orders`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(orders.body.data).toHaveLength(1);
    expect(order.body.data.items).toHaveLength(1);
  });
});
