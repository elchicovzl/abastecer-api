import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { createRequisitionSchema, type CreateRequisitionInput } from "./requisitions.dto";
import { RequisitionsService } from "./requisitions.service";

/**
 * El scope por contrato NO se aplica acá: vive en el service (ADR-002).
 * El controller solo traduce HTTP.
 */
@Controller("requisitions")
export class RequisitionsController {
  constructor(private readonly service: RequisitionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.detail(user, id);
  }

  @Post()
  @Roles("COORDINATOR")
  create(
    @CurrentUser() user: AuthenticatedUser,
    // El pipe va en @Body y NO en @UsePipes: a nivel de método se aplica a
    // TODOS los parámetros, incluido @Param("id"), que es un string y hace
    // fallar la validación del objeto.
    @Body(new ZodValidationPipe(createRequisitionSchema)) body: CreateRequisitionInput,
  ) {
    return this.service.create(user, body);
  }

  @Post(":id/submit")
  @Roles("COORDINATOR")
  submit(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.submit(user, id);
  }

  /** Paso final: bodega entrega y la requisición se cierra. */
  @Post(":id/deliver")
  @Roles("WAREHOUSE", "ADMIN")
  deliver(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.deliver(user, id);
  }

  /** Paso 2 del workflow: bodega verifica stock y divide líneas. */
  @Post(":id/verify-stock")
  @Roles("WAREHOUSE", "ADMIN")
  verifyStock(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.verifyStock(user, id);
  }
}
