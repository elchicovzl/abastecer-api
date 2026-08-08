import { Module } from "@nestjs/common";

import { InventoryModule } from "../inventory/inventory.module";
import { RequisitionsController } from "./requisitions.controller";
import { RequisitionsService } from "./requisitions.service";

@Module({
  imports: [InventoryModule],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
  exports: [RequisitionsService],
})
export class RequisitionsModule {}
