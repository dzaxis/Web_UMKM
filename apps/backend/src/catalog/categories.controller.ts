import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { CategoriesService } from "./categories.service.js";

@Controller("stores/:storeId/categories")
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

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
}
