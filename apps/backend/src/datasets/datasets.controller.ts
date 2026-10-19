import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { AuthUser } from "../common/types/auth-user.js";
import { ParseFilePipe, MaxFileSizeValidator } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as fs from "node:fs";
import * as path from "node:path";
import { extname } from "node:path";
import { v4 as uuid } from "uuid";
import { DatasetsService } from "./datasets.service.js";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const STORAGE_ROOT = path.resolve(process.cwd(), "storage", "uploads");

function makeStorage(storeIdProvider: () => string | undefined) {
  return diskStorage({
    destination: (req: any, _file: any, cb: any) => {
      const storeId = storeIdProvider() ?? (req.params as Record<string, string> | undefined)?.storeId;
      if (!storeId) {
        cb(new Error("storeId missing"), "");
        return;
      }
      const dir = path.resolve(STORAGE_ROOT, storeId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req: any, file: any, cb: any) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${uuid()}${ext}`);
    },
  });
}

@Controller("stores/:storeId/datasets")
export class DatasetsController {
  constructor(private readonly service: DatasetsService) {}

  @Get(":datasetId")
  @StoreAccess()
  async getDataset(@Param("storeId") storeId: string, @Param("datasetId") datasetId: string) {
    return {
      data: await this.service.get(storeId, datasetId),
    };
  }

  @Post(":datasetId/mapping")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess()
  async setMapping(
    @Param("storeId") storeId: string,
    @Param("datasetId") datasetId: string,
    @Body() body: any,
  ) {
    const mapping = body?.mapping ?? body;
    return {
      data: await this.service.setMapping(storeId, datasetId, mapping),
    };
  }

  @Post(":datasetId/validate")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess()
  async validate(@Param("storeId") storeId: string, @Param("datasetId") datasetId: string) {
    return {
      data: await this.service.validate(storeId, datasetId),
    };
  }

  @Post(":datasetId/commit")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess()
  async commitDataset(
    @Param("storeId") storeId: string,
    @Param("datasetId") datasetId: string,
  ) {
    return {
      data: await this.service.commit(storeId, datasetId),
    };
  }

  @Post(":datasetId/rollback")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess("OWNER")
  async rollbackDataset(
    @Param("storeId") storeId: string,
    @Param("datasetId") datasetId: string,
  ) {
    return {
      data: await this.service.rollback(storeId, datasetId),
    };
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: makeStorage(() => undefined),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @Param("storeId") storeId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES })],
      }),
    )
    file: any,
  ) {
    return {
      data: await this.service.upload(storeId, user.userId, file),
    };
  }

  @Get()
  @StoreAccess()
  async list(@Param("storeId") storeId: string) {
    return {
      data: await this.service.list(storeId),
    };
  }

  @Get("template.csv")
  templateCsv() {
    const headers = [
      "order_id",
      "order_date",
      "customer_code",
      "customer_name",
      "product_code",
      "product_name",
      "category",
      "qty",
      "unit",
      "unit_price",
      "total_price",
      "channel",
    ];
    const sample = [
      "ORD-1",
      "2026-01-01",
      "C1",
      "Ridho",
      "P1",
      "Teh Botol",
      "Minuman",
      "2",
      "botol",
      "3000",
      "6000",
      "online",
    ];
    return {
      headers,
      example: sample,
    };
  }

  @Get(":datasetId")
  @StoreAccess()
  async detail(@Param("storeId") storeId: string, @Param("datasetId") datasetId: string) {
    return {
      data: await this.service.get(storeId, datasetId),
    };
  }

  @Get(":datasetId/issues")
  @StoreAccess()
  async getIssues(@Param("storeId") storeId: string, @Param("datasetId") datasetId: string) {
    const result = await this.service.validate(storeId, datasetId);
    return {
      data: {
        dataset: result,
        issues: result.issues,
      },
    };
  }
}
