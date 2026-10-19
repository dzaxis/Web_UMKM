import { Body, Controller, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthUser } from "../common/types/auth-user.js";
import { AuditService } from "../audit/audit.service.js";
import { AUDIT_ACTIONS } from "../audit/audit-actions.js";
import { CustomersService } from "./customers.service.js";

@Controller("stores/:storeId/customers")
export class CustomersController {
  constructor(
    private readonly service: CustomersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @StoreAccess()
  async list(@Param("storeId") storeId: string) {
    return { data: await this.service.list(storeId) };
  }

  @Get("export")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async exportSegments(
    @Param("storeId") storeId: string,
    @Query("segment") segment: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const result = await this.service.exportSegments(storeId, segment);
    await this.audit.record({
      actorId: user.userId,
      storeId,
      action: AUDIT_ACTIONS.CUSTOMER_EXPORTED,
      entity: "customers",
      meta: { segment: result.segment, count: result.count },
    });
    const date = new Date().toISOString().split("T")[0];
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers_${result.segment}_${date}.csv"`,
    });
    res.send(result.csv);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async create(@Param("storeId") storeId: string, @Body() body: any) {
    return { data: await this.service.create(storeId, body) };
  }

  @Patch(":id")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async update(@Param("storeId") storeId: string, @Param("id") id: string, @Body() body: any) {
    return { data: await this.service.update(storeId, id, body) };
  }
}
