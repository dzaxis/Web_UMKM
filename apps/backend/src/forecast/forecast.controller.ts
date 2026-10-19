import { Controller, Get, Param, Post } from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { ForecastService } from "./forecast.service.js";

@Controller("stores/:storeId/forecast")
export class ForecastController {
  constructor(private readonly service: ForecastService) {}

  @Post("compute")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async computeForecast(@Param("storeId") storeId: string) {
    const result = await this.service.computeForecast(storeId);
    return {
      data: {
        status: "completed",
        ...result,
      },
    };
  }

  @Get(":productId")
  @StoreAccess()
  async getForecast(@Param("storeId") storeId: string, @Param("productId") productId: string) {
    const forecasts = await this.service.getForecast(storeId, productId);
    return {
      data: {
        productId,
        forecasts,
      },
    };
  }
}
