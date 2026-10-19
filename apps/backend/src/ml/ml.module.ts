// src/ml/ml.module.ts
import { Module } from "@nestjs/common";
import { MlClientService } from "./ml-client.service.js";
import { MlDataService } from "./ml-data.service.js";

@Module({
  providers: [MlClientService, MlDataService],
  exports: [MlClientService, MlDataService],
})
export class MlModule {}
