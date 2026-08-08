import { Controller, Get, Param, Query } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators";
import { ReportsService } from "./reports.service";

/**
 * Los filtros llegan como query params (strings). Se parsean acá y el
 * scope por contrato lo aplica el service, no este controller (ADR-002).
 */
@Controller("reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get("spend")
  spend(
    @CurrentUser() user: AuthenticatedUser,
    @Query("contractId") contractId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.spendByCategory(user, {
      contractId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get("requisitions")
  requisitions(
    @CurrentUser() user: AuthenticatedUser,
    @Query("contractId") contractId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.requisitionsByContract(user, {
      contractId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get("deliveries/:employeeId")
  deliveries(@CurrentUser() user: AuthenticatedUser, @Param("employeeId") employeeId: string) {
    return this.service.deliveriesByEmployee(user, employeeId);
  }

  @Get("low-stock")
  lowStock(@CurrentUser() user: AuthenticatedUser) {
    return this.service.lowStock(user);
  }
}
