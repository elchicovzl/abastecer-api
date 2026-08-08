import { NotFoundException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import type { AuthenticatedUser } from "../src/auth/auth.types";
import { ReportsService } from "../src/reports/reports.service";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";

/**
 * Fase 6 — reportes y dashboard.
 *
 * Todo reporte pasa por el mismo filtro de contrato (ADR-002). Un reporte
 * es la vía MÁS fácil de filtrar datos sin darse cuenta: agregás un GROUP BY
 * y de golpe el coordinador de A ve los montos de los otros 8 contratos.
 */
describe("reportes", () => {
  let app: INestApplication;
  let service: ReportsService;
  let coord1: AuthenticatedUser;
  let admin: AuthenticatedUser;
  let bodega: AuthenticatedUser;
  let contratoA: string;
  let contratoB: string;
  let employeeId: string;
  let itemId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
    service = app.get(ReportsService);

    const load = async (email: string): Promise<AuthenticatedUser> => {
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      return { id: u.id, email: u.email, role: u.role, contractId: u.contractId };
    };
    coord1 = await load("coord1@asofer.com");
    admin = await load("admin@asofer.com");
    bodega = await load("bodega@asofer.com");

    contratoA = coord1.contractId!;
    contratoB = (
      await prisma.contract.findFirstOrThrow({ where: { id: { not: contratoA } } })
    ).id;

    itemId = (await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } })).id;
    employeeId = (
      await prisma.employee.findFirstOrThrow({ where: { contractId: contratoA } })
    ).id;

    // Gasto aprobado en A: 10 × 100 (MATERIALES) y 2 × 50 (DOTACION)
    const dot = await prisma.item.findFirstOrThrow({ where: { sku: "DOT-001" } });
    for (const [contractId, lines] of [
      [contratoA, [{ itemId, qty: 10, price: "100.00" }, { itemId: dot.id, qty: 2, price: "50.00" }]],
      [contratoB, [{ itemId, qty: 5, price: "999.00" }]],
    ] as const) {
      const u = await prisma.user.findFirstOrThrow({
        where: { role: "COORDINATOR", contractId },
      });
      const req = await prisma.requisition.create({
        data: { contractId, requesterId: u.id, status: "EN_COMPRA" },
      });
      await prisma.purchaseOrder.create({
        data: {
          contractId,
          requisitionId: req.id,
          status: "APROBADA",
          lines: {
            create: lines.map((l) => ({
              itemId: l.itemId,
              orderedQty: l.qty,
              unitPrice: l.price,
            })),
          },
        },
      });
    }

    // Dos entregas de dotación al mismo empleado.
    await prisma.deliveryLog.createMany({
      data: [
        { contractId: contratoA, itemId: dot.id, employeeId, quantity: 1, deliveredById: bodega.id },
        { contractId: contratoA, itemId: dot.id, employeeId, quantity: 2, deliveredById: bodega.id },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("6.1: el gasto por clasificación suma solo OC APROBADAS", async () => {
    const totales = await service.spendByCategory(admin, { contractId: contratoA });
    const porCategoria = Object.fromEntries(totales.map((t) => [t.category, t.total]));

    expect(porCategoria["MATERIALES"]).toBe(1000); // 10 × 100
    expect(porCategoria["DOTACION"]).toBe(100); // 2 × 50
  });

  it("6.1 / ADR-002: el COORDINATOR NO ve el gasto de otro contrato", async () => {
    // Pide explícitamente el contrato B: debe rebotar con 404, no devolver datos.
    await expect(
      service.spendByCategory(coord1, { contractId: contratoB }),
    ).rejects.toThrow(NotFoundException);
  });

  it("6.1: sin filtro, el COORDINATOR recibe solo lo suyo", async () => {
    const suyo = await service.spendByCategory(coord1, {});
    const total = suyo.reduce((acc, t) => acc + t.total, 0);

    // 1100 es el total de A. Si se colara B, serían 1100 + 4995.
    expect(total).toBe(1100);
  });

  it("6.1: el ADMIN sin filtro ve el gasto de todos los contratos", async () => {
    const todo = await service.spendByCategory(admin, {});
    const total = todo.reduce((acc, t) => acc + t.total, 0);
    expect(total).toBe(1100 + 4995);
  });

  it("6.1: el filtro por rango de fechas acota los resultados", async () => {
    const futuro = await service.spendByCategory(admin, {
      contractId: contratoA,
      from: new Date("2030-01-01"),
    });
    expect(futuro.reduce((acc, t) => acc + t.total, 0)).toBe(0);

    const ahora = await service.spendByCategory(admin, {
      contractId: contratoA,
      from: new Date("2020-01-01"),
    });
    expect(ahora.reduce((acc, t) => acc + t.total, 0)).toBe(1100);
  });

  it("6.1: el dashboard por contrato lista los artículos pedidos con su estado", async () => {
    const filas = await service.requisitionsByContract(coord1, {});

    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((f) => f.contractId === contratoA)).toBe(true);
    expect(filas[0]).toHaveProperty("status");
    expect(filas[0]).toHaveProperty("createdAt");
  });

  it("6.3: el historial de dotación por empleado devuelve todas sus entregas", async () => {
    const historial = await service.deliveriesByEmployee(admin, employeeId);

    expect(historial).toHaveLength(2);
    expect(historial.reduce((acc, d) => acc + d.quantity, 0)).toBe(3);
    expect(historial[0]?.itemName).toBeTruthy();
    expect(historial[0]?.deliveredAt).toBeInstanceOf(Date);
  });

  it("6.3: consultar el historial de un empleado de OTRO contrato da 404", async () => {
    const ajeno = await prisma.employee.findFirstOrThrow({
      where: { contractId: contratoB },
    });
    await expect(service.deliveriesByEmployee(coord1, ajeno.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("6.1: las alertas de stock mínimo respetan el contrato", async () => {
    const alertas = await service.lowStock(coord1);
    const bodegaA = await prisma.warehouse.findUniqueOrThrow({
      where: { contractId: contratoA },
    });
    expect(alertas.every((a) => a.warehouseId === bodegaA.id)).toBe(true);
  });
});
