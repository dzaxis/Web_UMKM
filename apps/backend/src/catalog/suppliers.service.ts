import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string) {
    return this.prisma.suppliers.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(storeId: string, body: any) {
    return this.prisma.suppliers.create({
      data: {
        storeId,
        name: body.name,
        contact: body.contact ?? null,
        address: body.address ?? null,
      },
    });
  }

  async get(storeId: string, id: string) {
    const row = await this.prisma.suppliers.findFirst({
      where: { id, storeId },
    });
    if (!row) throw new Error("Not found");
    return row;
  }

  async update(storeId: string, id: string, body: any) {
    await this.get(storeId, id);
    return this.prisma.suppliers.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        contact: body.contact ?? undefined,
        address: body.address ?? undefined,
      },
    });
  }

  async delete(storeId: string, id: string) {
    await this.get(storeId, id);
    await this.prisma.suppliers.delete({ where: { id } });
    return { deleted: true };
  }

  async listProductSuppliers(storeId: string, productId: string) {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new Error("Product not found");

    return this.prisma.productSuppliers.findMany({
      where: { productId },
      include: { supplier: true },
    });
  }

  async linkSupplier(storeId: string, productId: string, body: any) {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new Error("Product not found");

    await this.get(storeId, body.supplierId);

    return this.prisma.productSuppliers.upsert({
      where: { productId_supplierId: { productId, supplierId: body.supplierId } },
      create: {
        productId,
        supplierId: body.supplierId,
        costPrice: body.costPrice,
        leadDays: body.leadDays ?? 7,
      },
      update: {
        costPrice: body.costPrice,
        leadDays: body.leadDays ?? 7,
      },
      include: { supplier: true },
    });
  }

  async unlinkSupplier(storeId: string, productId: string, supplierId: string) {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new Error("Product not found");

    await this.prisma.productSuppliers.delete({
      where: { productId_supplierId: { productId, supplierId } },
    });
    return { deleted: true };
  }
}
