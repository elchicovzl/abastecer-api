import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { InventoryService } from "./inventory.service";

const adjustSchema = z.object({
  itemId: z.uuid(),
  quantity: z.number().int().nonnegative(),
  reason: z.string().min(5, { error: "Indicá el motivo del ajuste" }),
});

const minimumSchema = z.object({
  itemId: z.uuid(),
  minQuantity: z.number().int().nonnegative(),
});

@Controller("inventory")
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  /** Inventario visible según el rol (el coordinador ve solo su bodega). */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listStock(user);
  }

  /** Carga inicial, merma o corrección de conteo. Exige motivo. */
  @Post(":warehouseId/adjust")
  @Roles("WAREHOUSE", "ADMIN")
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param("warehouseId") warehouseId: string,
    @Body(new ZodValidationPipe(adjustSchema))
    body: { itemId: string; quantity: number; reason: string },
  ) {
    return this.service.adjust(user, { warehouseId, ...body });
  }

  /** Define el mínimo que dispara la alerta de reposición. */
  @Post(":warehouseId/minimum")
  @Roles("WAREHOUSE", "ADMIN")
  setMinimum(
    @CurrentUser() user: AuthenticatedUser,
    @Param("warehouseId") warehouseId: string,
    @Body(new ZodValidationPipe(minimumSchema))
    body: { itemId: string; minQuantity: number },
  ) {
    return this.service.setMinimum(user, { warehouseId, ...body });
  }
}
