import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import type { AuthenticatedUser } from "../src/auth/auth.types";
import { RequisitionsService } from "../src/requisitions/requisitions.service";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";

/**
 * Tareas 5.2 a 5.5 — creación de requisiciones y verificación de stock.
 *
 * El caso que más se implementa mal es la COBERTURA PARCIAL: pido 10, hay 4.
 * Lo intuitivo es rechazar todo o comprar todo. Las dos cosas están mal:
 * despachar los 4 que ya están y comprar solo los 6 que faltan es lo que
 * hace que la obra no se frene esperando una compra completa.
 */
describe("requisiciones", () => {
  let app: INestApplication;
  let service: RequisitionsService;
  let coord1: AuthenticatedUser;
  let bodega: AuthenticatedUser;
  let warehouseId: string;
  let itemId: string;
  let employeeId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
    service = app.get(RequisitionsService);

    const u1 = await prisma.user.findUniqueOrThrow({ where: { email: "coord1@asofer.com" } });
    const ub = await prisma.user.findUniqueOrThrow({ where: { email: "bodega@asofer.com" } });
    coord1 = { id: u1.id, email: u1.email, role: u1.role, contractId: u1.contractId };
    bodega = { id: ub.id, email: ub.email, role: ub.role, contractId: ub.contractId };

    warehouseId = (
      await prisma.warehouse.findUniqueOrThrow({ where: { contractId: coord1.contractId ?? "" } })
    ).id;
    itemId = (await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } })).id;
    employeeId = (
      await prisma.employee.findFirstOrThrow({ where: { contractId: coord1.contractId ?? "" } })
    ).id;
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

  it("5.3: la requisición nace en BORRADOR y en el contrato del solicitante", async () => {
    const req = await service.create(coord1, {
      lines: [
        { itemId, quantity: 5, justification: "Reposición", type: "MATERIAL_OBRA" },
      ],
    });

    expect(req.status).toBe("BORRADOR");
    expect(req.contractId).toBe(coord1.contractId);
    expect(req.lines).toHaveLength(1);
  });

  it("5.2 / ADR-005: DOTACION_PERSONAL sin empleado es rechazada", async () => {
    await expect(
      service.create(coord1, {
        lines: [
          { itemId, quantity: 1, justification: "Botas", type: "DOTACION_PERSONAL" },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("5.2 / ADR-005: DOTACION_PERSONAL con empleado de OTRO contrato es rechazada", async () => {
    const ajeno = await prisma.employee.findFirstOrThrow({
      where: { contractId: { not: coord1.contractId ?? "" } },
    });

    await expect(
      service.create(coord1, {
        lines: [
          {
            itemId,
            quantity: 1,
            justification: "Casco",
            type: "DOTACION_PERSONAL",
            employeeId: ajeno.id,
          },
        ],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("5.2: DOTACION_PERSONAL con empleado propio se acepta", async () => {
    const req = await service.create(coord1, {
      lines: [
        {
          itemId,
          quantity: 2,
          justification: "Cascos",
          type: "DOTACION_PERSONAL",
          employeeId,
        },
      ],
    });
    expect(req.lines[0]?.employeeId).toBe(employeeId);
  });

  it("5.3: una requisición sin líneas es rechazada", async () => {
    await expect(service.create(coord1, { lines: [] })).rejects.toThrow(BadRequestException);
  });

  it("5.5: con stock de sobra, todo sale de bodega y queda ENTREGADO", async () => {
    await setStock(50);
    const req = await service.create(coord1, {
      lines: [{ itemId, quantity: 10, justification: "Obra", type: "MATERIAL_OBRA" }],
    });
    await service.submit(coord1, req.id);

    const result = await service.verifyStock(bodega, req.id);

    expect(result.status).toBe("ENTREGADO");
    expect(result.purchaseOrder).toBeNull();

    const stock = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId, itemId } },
    });
    expect(stock.quantity).toBe(40);
  });

  it("5.4 / 5.5: COBERTURA PARCIAL — pido 10, hay 4 → salen 4 y OC por 6", async () => {
    await setStock(4);
    const req = await service.create(coord1, {
      lines: [{ itemId, quantity: 10, justification: "Obra", type: "MATERIAL_OBRA" }],
    });
    await service.submit(coord1, req.id);

    const result = await service.verifyStock(bodega, req.id);

    // La bodega queda en cero: se despachó todo lo que había.
    const stock = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId, itemId } },
    });
    expect(stock.quantity).toBe(0);

    // Y se generó una OC por EXACTAMENTE lo que faltaba.
    expect(result.status).toBe("PENDIENTE_APROBACION_JEFE");
    expect(result.purchaseOrder).not.toBeNull();

    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: result.purchaseOrder!.id },
      include: { lines: true },
    });
    expect(po.lines).toHaveLength(1);
    expect(po.lines[0]?.orderedQty).toBe(6);
    expect(po.lines[0]?.receivedQty).toBe(0);
  });

  it("5.5: sin nada de stock, no se despacha y la OC pide el total", async () => {
    await setStock(0);
    const req = await service.create(coord1, {
      lines: [{ itemId, quantity: 7, justification: "Obra", type: "MATERIAL_OBRA" }],
    });
    await service.submit(coord1, req.id);

    const result = await service.verifyStock(bodega, req.id);
    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: result.purchaseOrder!.id },
      include: { lines: true },
    });

    expect(po.lines[0]?.orderedQty).toBe(7);
    expect(result.status).toBe("PENDIENTE_APROBACION_JEFE");
  });

  it("5.5: verificar el stock de una requisición ajena da 404 (ADR-008)", async () => {
    const otro = await prisma.user.findFirstOrThrow({
      where: { role: "COORDINATOR", contractId: { not: coord1.contractId ?? "" } },
    });
    const ajena = await prisma.requisition.create({
      data: {
        contractId: otro.contractId!,
        requesterId: otro.id,
        status: "PENDIENTE_INVENTARIO",
      },
    });

    await expect(service.detail(coord1, ajena.id)).rejects.toThrow(NotFoundException);
  });

  it("5.5: no se puede verificar stock dos veces (ADR-004)", async () => {
    await setStock(20);
    const req = await service.create(coord1, {
      lines: [{ itemId, quantity: 2, justification: "Obra", type: "MATERIAL_OBRA" }],
    });
    await service.submit(coord1, req.id);
    await service.verifyStock(bodega, req.id);

    // Ya está ENTREGADO: la máquina de estados no permite volver.
    await expect(service.verifyStock(bodega, req.id)).rejects.toThrow(BadRequestException);
  });
});
