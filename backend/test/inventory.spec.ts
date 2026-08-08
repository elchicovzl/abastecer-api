import { NotFoundException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import { InventoryService } from "../src/inventory/inventory.service";
import type { AuthenticatedUser } from "../src/auth/auth.types";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";

/**
 * Tareas 4.1, 4.2 y 4.5 — inventario multi-bodega.
 *
 * El invariante que se protege: el stock NUNCA se agrega entre contratos.
 * "Hay 10 unidades" no significa nada sin decir en qué bodega — y un
 * coordinador solo puede ver la suya.
 */
describe("inventario", () => {
  let app: INestApplication;
  let service: InventoryService;
  let coord1: AuthenticatedUser;
  let coord2: AuthenticatedUser;
  let admin: AuthenticatedUser;
  let itemId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
    service = app.get(InventoryService);

    const u1 = await prisma.user.findUniqueOrThrow({ where: { email: "coord1@asofer.com" } });
    const u2 = await prisma.user.findUniqueOrThrow({ where: { email: "coord2@asofer.com" } });
    const ua = await prisma.user.findUniqueOrThrow({ where: { email: "admin@asofer.com" } });
    coord1 = { id: u1.id, email: u1.email, role: u1.role, contractId: u1.contractId };
    coord2 = { id: u2.id, email: u2.email, role: u2.role, contractId: u2.contractId };
    admin = { id: ua.id, email: ua.email, role: ua.role, contractId: ua.contractId };

    itemId = (await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("4.1: el COORDINATOR solo ve el stock de la bodega de SU contrato", async () => {
    const deCoord1 = await service.listStock(coord1);
    const deCoord2 = await service.listStock(coord2);

    expect(deCoord1.length).toBeGreaterThan(0);
    expect(deCoord2.length).toBeGreaterThan(0);

    // Todas las filas pertenecen a la bodega del propio contrato.
    const bodegasVistas = new Set(deCoord1.map((s) => s.warehouseId));
    expect(bodegasVistas.size).toBe(1);

    // Y son bodegas DISTINTAS entre coordinadores de contratos distintos.
    expect(deCoord2.every((s) => !bodegasVistas.has(s.warehouseId))).toBe(true);
  });

  it("4.1: el ADMIN ve el stock de las 9 bodegas", async () => {
    const todo = await service.listStock(admin);
    expect(new Set(todo.map((s) => s.warehouseId)).size).toBe(9);
  });

  it("4.1: el mismo ítem tiene cantidades independientes por bodega", async () => {
    const filas = await prisma.stock.findMany({ where: { itemId } });
    expect(filas.length).toBe(9);

    // El seed reparte cantidades distintas a propósito: si el stock se
    // agregara entre contratos, esto daría un solo valor.
    expect(new Set(filas.map((f) => f.quantity)).size).toBeGreaterThan(1);
  });

  it("4.2: consultar disponibilidad de un ítem en otro contrato da 404 (ADR-008)", async () => {
    const bodegaAjena = await prisma.warehouse.findFirstOrThrow({
      where: { contractId: { not: coord1.contractId ?? "" } },
    });

    await expect(
      service.availability(coord1, bodegaAjena.id, itemId),
    ).rejects.toThrow(NotFoundException);
  });

  it("4.2: la disponibilidad de la propia bodega devuelve la cantidad real", async () => {
    const propia = await prisma.warehouse.findFirstOrThrow({
      where: { contractId: coord1.contractId ?? "" },
    });
    const fila = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId: propia.id, itemId } },
    });

    const resultado = await service.availability(coord1, propia.id, itemId);
    expect(resultado.quantity).toBe(fila.quantity);
  });

  it("4.5: marca alerta cuando el stock queda por debajo del mínimo", async () => {
    const propia = await prisma.warehouse.findFirstOrThrow({
      where: { contractId: coord1.contractId ?? "" },
    });
    await prisma.stock.update({
      where: { warehouseId_itemId: { warehouseId: propia.id, itemId } },
      data: { quantity: 6, minQuantity: 5 },
    });

    // 6 > 5: todavía no hay alerta.
    let alertas = await service.lowStockAlerts(coord1);
    expect(alertas.some((a) => a.itemId === itemId)).toBe(false);

    // Despachar 2 lo deja en 4, por debajo del mínimo.
    await prisma.stock.update({
      where: { warehouseId_itemId: { warehouseId: propia.id, itemId } },
      data: { quantity: 4 },
    });

    alertas = await service.lowStockAlerts(coord1);
    const alerta = alertas.find((a) => a.itemId === itemId);
    expect(alerta).toBeDefined();
    expect(alerta?.quantity).toBe(4);
    expect(alerta?.minQuantity).toBe(5);
  });

  it("4.5: las alertas del COORDINATOR son solo de su bodega", async () => {
    const alertas = await service.lowStockAlerts(coord1);
    const propia = await prisma.warehouse.findFirstOrThrow({
      where: { contractId: coord1.contractId ?? "" },
    });
    expect(alertas.every((a) => a.warehouseId === propia.id)).toBe(true);
  });
});
