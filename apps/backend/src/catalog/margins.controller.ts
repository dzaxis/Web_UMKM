import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { MarginsService } from "./margins.service.js";

@Controller("stores/:storeId/products/:productId/margins")
export class MarginsController {
  constructor(private readonly service: MarginsService) {}

  @Get()
  @StoreAccess()
  async getMargin(@Param("storeId") storeId: string, @Param("productId") productId: string) {
    const margin = await this.service.getMargin(storeId, productId);
    return { data: margin };
  }

  @Patch()
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async setMargin(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Body() body: any,
  ) {
    return { data: await this.service.setMargin(storeId, productId, body) };
  }
}
