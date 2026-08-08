import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import { prisma, resetDatabase } from "./db";

/**
 * Tarea 2.6 — el seed no es "datos de ejemplo": es la base sobre la que
 * corren los E2E de la fase 8. Si el seed cambia sin querer, esos tests
 * fallan lejos de la causa. Estos asserts lo fijan.
 */
describe("seed", () => {
  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("crea los 9 contratos, cada uno con su bodega", async () => {
    const contracts = await prisma.contract.count();
    const warehouses = await prisma.warehouse.count();

    expect(contracts).toBe(9);
    expect(warehouses).toBe(9);
  });

  it("crea 15 usuarios cubriendo los 4 roles", async () => {
    expect(await prisma.user.count()).toBe(15);

    const porRol = await prisma.user.groupBy({ by: ["role"], _count: true });
    const conteo = Object.fromEntries(porRol.map((r) => [r.role, r._count]));

    expect(conteo["COORDINATOR"]).toBe(12);
    expect(conteo["ADMIN"]).toBe(1);
    expect(conteo["WAREHOUSE"]).toBe(1);
    expect(conteo["PURCHASING_MANAGER"]).toBe(1);
  });

  it("ata cada COORDINATOR a un contrato y deja libres a los demás roles", async () => {
    const sinContrato = await prisma.user.findMany({
      where: { role: "COORDINATOR", contractId: null },
    });
    expect(sinContrato).toHaveLength(0);

    const otros = await prisma.user.findMany({
      where: { role: { not: "COORDINATOR" } },
      select: { contractId: true },
    });
    expect(otros.every((u) => u.contractId === null)).toBe(true);
  });

  it("crea coord1 y coord2 en contratos DISTINTOS", async () => {
    // Los E2E de segregación (tarea 8.3) dependen de esto.
    const c1 = await prisma.user.findUniqueOrThrow({
      where: { email: "coord1@asofer.com" },
    });
    const c2 = await prisma.user.findUniqueOrThrow({
      where: { email: "coord2@asofer.com" },
    });

    expect(c1.contractId).not.toBeNull();
    expect(c2.contractId).not.toBeNull();
    expect(c1.contractId).not.toBe(c2.contractId);
  });

  it("crea 45 empleados repartidos entre los 9 contratos", async () => {
    expect(await prisma.employee.count()).toBe(45);

    const porContrato = await prisma.employee.groupBy({
      by: ["contractId"],
      _count: true,
    });
    expect(porContrato).toHaveLength(9);
    expect(porContrato.every((c) => c._count === 5)).toBe(true);
  });

  it("crea 50 ítems cubriendo las 4 categorías de gasto", async () => {
    expect(await prisma.item.count()).toBe(50);

    const categorias = await prisma.item.groupBy({ by: ["category"], _count: true });
    expect(categorias).toHaveLength(4);
    expect(categorias.every((c) => c._count > 0)).toBe(true);
  });

  it("siembra stock en las 9 bodegas, nunca negativo", async () => {
    const stock = await prisma.stock.findMany();

    expect(stock.length).toBeGreaterThan(0);
    expect(new Set(stock.map((s) => s.warehouseId)).size).toBe(9);
    expect(stock.every((s) => s.quantity >= 0)).toBe(true);
    // Al menos una fila con stock real, si no el inventario arranca vacío
    // y los tests de despacho de la fase 4 no tendrían de dónde sacar.
    expect(stock.some((s) => s.quantity > 0)).toBe(true);
  });

  it("guarda las contraseñas hasheadas, nunca en claro", async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@asofer.com" },
    });

    expect(admin.passwordHash).not.toBe("changeme123");
    expect(admin.passwordHash.startsWith("$2")).toBe(true); // prefijo bcrypt
  });

  it("es idempotente: correrlo dos veces no duplica", async () => {
    await seed(prisma);

    expect(await prisma.contract.count()).toBe(9);
    expect(await prisma.user.count()).toBe(15);
    expect(await prisma.item.count()).toBe(50);
  });
});
