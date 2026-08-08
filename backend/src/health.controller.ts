import { Controller, Get } from "@nestjs/common";

import { Public } from "./auth/decorators";

/**
 * Sonda de salud. Público a propósito: lo consultan Playwright antes de
 * arrancar los E2E, y cualquier orquestador o balanceador que necesite
 * saber si el proceso está vivo. No expone nada sensible.
 */
@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check(): { status: string } {
    return { status: "ok" };
  }
}
