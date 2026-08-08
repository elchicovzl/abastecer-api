import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  approveOrderSchema,
  receiveOrderSchema,
  rejectOrderSchema,
  type ApproveOrderInput,
  type ReceiveOrderInput,
} from "../requisitions/requisitions.dto";
import { PurchaseOrdersService } from "./purchase-orders.service";

@Controller("purchase-orders")
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Post(":id/approve")
  @Roles("PURCHASING_MANAGER")
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(approveOrderSchema)) body: ApproveOrderInput,
  ) {
    return this.service.approve(user, id, body);
  }

  @Post(":id/reject")
  @Roles("PURCHASING_MANAGER")
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectOrderSchema)) body: { reason: string },
  ) {
    return this.service.reject(user, id, body.reason);
  }

  @Post(":id/receive")
  @Roles("WAREHOUSE", "ADMIN")
  receive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(receiveOrderSchema)) body: ReceiveOrderInput,
  ) {
    return this.service.receive(user, id, body);
  }
}
