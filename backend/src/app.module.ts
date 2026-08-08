import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { AuditInterceptor } from "./common/audit.interceptor";
import { InventoryModule } from "./inventory/inventory.module";
import { validateEnv } from "./config/env.schema";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { PurchaseOrdersModule } from "./purchase-orders/purchase-orders.module";
import { ReportsModule } from "./reports/reports.module";
import { RequisitionsModule } from "./requisitions/requisitions.module";

/**
 * Módulo raíz.
 *
 * Los guards se registran GLOBALES y en este orden: primero JwtAuthGuard
 * (¿quién sos?), después RolesGuard (¿podés hacer esto?). El orden importa:
 * RolesGuard lee `request.user`, que lo popula el anterior.
 *
 * Globales y no por controller a propósito. Con guards locales, cada
 * endpoint nuevo nace desprotegido hasta que alguien se acuerda de decorarlo.
 * Así el default es cerrado y hay que pedir @Public() explícitamente.
 *
 * Backend completo: auth, inventario, requisiciones, órdenes de compra
 * y reportes. Falta el frontend (fase 7) y los E2E (fase 8).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    InventoryModule,
    RequisitionsModule,
    PurchaseOrdersModule,
    ReportsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
