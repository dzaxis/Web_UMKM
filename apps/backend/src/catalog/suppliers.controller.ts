import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { SuppliersService } from "./suppliers.service.js";

@Controller("stores/:storeId/suppliers")
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  @StoreAccess()
  async list(@Param("storeId") storeId: string) {
    return { data: await this.service.list(storeId) };
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async create(@Param("storeId") storeId: string, @Body() body: any) {
    return { data: await this.service.create(storeId, body) };
  }

  @Get(":id")
  @StoreAccess()
  async get(@Param("storeId") storeId: string, @Param("id") id: string) {
    return { data: await this.service.get(storeId, id) };
  }

  @Patch(":id")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async update(@Param("storeId") storeId: string, @Param("id") id: string, @Body() body: any) {
    return { data: await this.service.update(storeId, id, body) };
  }

  @Delete(":id")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async delete(@Param("storeId") storeId: string, @Param("id") id: string) {
    return await this.service.delete(storeId, id);
  }

  @Get(":supplierId/products/:productId")
  @StoreAccess()
  async getProductSuppliers(@Param("storeId") storeId: string, @Param("productId") productId: string) {
    return { data: await this.service.listProductSuppliers(storeId, productId) };
  }

  @Post(":supplierId/products/:productId")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async linkSupplier(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Body() body: any,
  ) {
    return { data: await this.service.linkSupplier(storeId, productId, { ...body, supplierId: body.supplierId }) };
  }

  @Delete(":supplierId/products/:productId")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async unlinkSupplier(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Param("supplierId") supplierId: string,
  ) {
    return await this.service.unlinkSupplier(storeId, productId, supplierId);
  }
}
