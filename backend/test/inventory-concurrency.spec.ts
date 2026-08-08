import { BadRequestException, type INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import type { AuthenticatedUser } from "../src/auth/auth.types";
import { InventoryService } from "../src/inventory/inventory.service";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";

/**
 * Tarea 4.3 — ADR-007. EL test difícil del proyecto.
 *
 * El bug que previene: `leer cantidad → decidir → escribir` sin protección.
 * Dos despachos simultáneos del último ítem leen "queda 1", los dos deciden
 * que alcanza, y los dos descuentan. Resultado: stock en -1 y una unidad
 * entregada dos veces.
 *
 * En producción esto no aparece en las pruebas manuales: solo pasa cuando
 * dos personas hacen clic en el mismo segundo. Aparece meses después, como
 * un inventario que "no cuadra" y que nadie sabe explicar.
 *
 * La defensa es `SELECT ... FOR UPDATE` dentro de una transacción: el segundo
 * despacho espera a que el primero termine, y entonces ve el stock REAL.
 */
describe("concurrencia de stock (ADR-007)", () => {
  let app: INestApplication;
  let service: InventoryService;
  let warehouse: AuthenticatedUser;
  let warehouseId: string;
  let itemId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
    service = app.get(InventoryService);

    const u = await prisma.user.findUniqueOrThrow({ where: { email: "bodega@asofer.com" } });
    warehouse = { id: u.id, email: u.email, role: u.role, contractId: u.contractId };

    warehouseId = (await prisma.warehouse.findFirstOrThrow()).id;
    itemId = (await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const setStock = (quantity: number) =>
    prisma.stock.update({
      where: { warehouseId_itemId: { warehouseId, itemId } },
      data: { quantity },
    });

  const currentQuantity = async () =>
    (
      await prisma.stock.findUniqueOrThrow({
        where: { warehouseId_itemId: { warehouseId, itemId } },
      })
    ).quantity;

  it("descuenta correctamente en un despacho normal", async () => {
    await setStock(10);
    await service.dispatch(warehouse, { warehouseId, itemId, quantity: 4 });
    expect(await currentQuantity()).toBe(6);
  });

  it("rechaza limpio cuando se pide más de lo que hay, sin tocar el stock", async () => {
    await setStock(3);
    await expect(
      service.dispatch(warehouse, { warehouseId, itemId, quantity: 5 }),
    ).rejects.toThrow();
    expect(await currentQuantity()).toBe(3);
  });

  it("ADR-007: dos despachos SIMULTÁNEOS del último ítem → uno gana, uno falla", async () => {
    await setStock(1);

    const [a, b] = await Promise.allSettled([
      service.dispatch(warehouse, { warehouseId, itemId, quantity: 1 }),
      service.dispatch(warehouse, { warehouseId, itemId, quantity: 1 }),
    ]);

    const exitosos = [a, b].filter((r) => r.status === "fulfilled").length;
    const fallidos = [a, b].filter((r) => r.status === "rejected").length;

    // Exactamente uno. Si fueran dos, entregamos una unidad que no existía.
    expect(exitosos).toBe(1);
    expect(fallidos).toBe(1);
    expect(await currentQuantity()).toBe(0);

    // Y falla POR LA RAZÓN CORRECTA. Si el rechazo viniera del CHECK
    // constraint de Postgres, el mensaje sería de violación de constraint:
    // eso significaría que el lock NO funcionó y que nos salvó la última
    // línea de defensa. Queremos que la lógica de negocio decida ANTES.
    const rechazado = [a, b].find((r) => r.status === "rejected");
    const error = (rechazado as PromiseRejectedResult).reason as Error;
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain("Stock insuficiente");
  });

  it("ADR-007: 5 despachos simultáneos con stock 3 → exactamente 3 pasan", async () => {
    await setStock(3);

    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.dispatch(warehouse, { warehouseId, itemId, quantity: 1 }),
      ),
    );

    const exitosos = resultados.filter((r) => r.status === "fulfilled").length;
    expect(exitosos).toBe(3);
    expect(await currentQuantity()).toBe(0);
  });

  it("ADR-007: el stock NUNCA queda negativo, pase lo que pase", async () => {
    await setStock(2);

    await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        service.dispatch(warehouse, { warehouseId, itemId, quantity: 1 }),
      ),
    );

    const final = await currentQuantity();
    expect(final).toBeGreaterThanOrEqual(0);
    expect(final).toBe(0);
  });

  it("despachos concurrentes de ítems DISTINTOS no se bloquean entre sí", async () => {
    const otro = await prisma.item.findFirstOrThrow({ where: { sku: "MAT-002" } });
    await setStock(5);
    await prisma.stock.upsert({
      where: { warehouseId_itemId: { warehouseId, itemId: otro.id } },
      update: { quantity: 5 },
      create: { warehouseId, itemId: otro.id, quantity: 5, minQuantity: 0 },
    });

    // El lock es por FILA, no por tabla: dos ítems distintos avanzan a la vez.
    const resultados = await Promise.allSettled([
      service.dispatch(warehouse, { warehouseId, itemId, quantity: 5 }),
      service.dispatch(warehouse, { warehouseId, itemId: otro.id, quantity: 5 }),
    ]);

    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
  });
});
