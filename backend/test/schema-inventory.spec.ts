import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma, resetDatabase } from "./db";

/**
 * Tarea 2.3 — Item y Stock.
 *
 * Acá viven los dos constraints que sostienen todo el módulo de inventario:
 *   · UNIQUE(warehouseId, itemId) → una sola fila de stock por ítem y bodega
 *   · CHECK quantity >= 0         → última defensa del ADR-007
 *
 * El CHECK no reemplaza al lock pesimista de la fase 4: lo respalda. Si algún
 * día falla el lock, o alguien corre un UPDATE a mano, la base se niega igual.
 */
async function makeWarehouse(code: string) {
  const contract = await prisma.contract.create({
    data: { code, name: `Obra ${code}` },
  });
  return prisma.warehouse.create({
    data: { name: `Bodega ${code}`, contractId: contract.id },
  });
}

describe("inventario", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("el ítem se clasifica por categoría de gasto y su SKU es único", async () => {
    const item = await prisma.item.create({
      data: { sku: "MAT-001", name: "Cemento gris 50kg", category: "MATERIALES", unit: "bolsa" },
    });
    expect(item.category).toBe("MATERIALES");

    await expect(
      prisma.item.create({
        data: { sku: "MAT-001", name: "Duplicado", category: "EQUIPOS", unit: "u" },
      }),
    ).rejects.toThrow();
  });

  it("no admite dos filas de stock para el mismo ítem en la misma bodega", async () => {
    const warehouse = await makeWarehouse("C-101");
    const item = await prisma.item.create({
      data: { sku: "MAT-002", name: "Arena", category: "MATERIALES", unit: "m3" },
    });

    const stock = await prisma.stock.create({
      data: { warehouseId: warehouse.id, itemId: item.id, quantity: 10, minQuantity: 5 },
    });
    expect(stock.quantity).toBe(10);

    await expect(
      prisma.stock.create({
        data: { warehouseId: warehouse.id, itemId: item.id, quantity: 3 },
      }),
    ).rejects.toThrow();
  });

  it("el mismo ítem existe por separado en bodegas distintas", async () => {
    const a = await makeWarehouse("C-102");
    const b = await makeWarehouse("C-103");
    const item = await prisma.item.create({
      data: { sku: "MAT-003", name: "Ladrillo", category: "MATERIALES", unit: "u" },
    });

    await prisma.stock.create({
      data: { warehouseId: a.id, itemId: item.id, quantity: 100 },
    });
    await prisma.stock.create({
      data: { warehouseId: b.id, itemId: item.id, quantity: 0 },
    });

    // El aislamiento entre contratos: la bodega B no ve el stock de A.
    const inB = await prisma.stock.findUnique({
      where: { warehouseId_itemId: { warehouseId: b.id, itemId: item.id } },
    });
    expect(inB?.quantity).toBe(0);
  });

  it("ADR-007: la base RECHAZA stock negativo", async () => {
    const warehouse = await makeWarehouse("C-104");
    const item = await prisma.item.create({
      data: { sku: "MAT-004", name: "Cal", category: "MATERIALES", unit: "bolsa" },
    });

    await expect(
      prisma.stock.create({
        data: { warehouseId: warehouse.id, itemId: item.id, quantity: -1 },
      }),
    ).rejects.toThrow();
  });

  it("ADR-007: tampoco deja llegar a negativo por UPDATE", async () => {
    const warehouse = await makeWarehouse("C-105");
    const item = await prisma.item.create({
      data: { sku: "MAT-005", name: "Yeso", category: "MATERIALES", unit: "bolsa" },
    });
    const stock = await prisma.stock.create({
      data: { warehouseId: warehouse.id, itemId: item.id, quantity: 2 },
    });

    // Despachar 5 cuando hay 2: el servicio debería impedirlo, pero si falla,
    // la base es la que tiene la última palabra.
    await expect(
      prisma.stock.update({
        where: { id: stock.id },
        data: { quantity: { decrement: 5 } },
      }),
    ).rejects.toThrow();

    const unchanged = await prisma.stock.findUniqueOrThrow({ where: { id: stock.id } });
    expect(unchanged.quantity).toBe(2);
  });

  it("cero es válido: agotado no es lo mismo que inválido", async () => {
    const warehouse = await makeWarehouse("C-106");
    const item = await prisma.item.create({
      data: { sku: "MAT-006", name: "Clavos", category: "CONSUMIBLES", unit: "kg" },
    });

    const stock = await prisma.stock.create({
      data: { warehouseId: warehouse.id, itemId: item.id, quantity: 0 },
    });
    expect(stock.quantity).toBe(0);
  });
});
