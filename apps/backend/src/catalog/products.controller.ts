import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { AuthUser } from "../common/types/auth-user.js";
import { ProductsService } from "./products.service.js";

@Controller("stores/:storeId/products")
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @StoreAccess()
  async list(@Param("storeId") storeId: string) {
    return { data: await this.service.list(storeId) };
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async create(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string, @Body() body: any) {
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
  async del(@Param("storeId") storeId: string, @Param("id") id: string) {
    return { data: await this.service.delete(storeId, id) };
  }
}
