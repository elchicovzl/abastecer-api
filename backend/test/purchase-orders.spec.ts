import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import type { AuthenticatedUser } from "../src/auth/auth.types";
import { PurchaseOrdersService } from "../src/purchase-orders/purchase-orders.service";
import { RequisitionsService } from "../src/requisitions/requisitions.service";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";

/**
 * Tareas 5.6 a 5.8 — aprobación, recepción y entrega.
 *
 * El invariante del ADR-003: el stock se incrementa por lo EFECTIVAMENTE
 * recibido, nunca por lo pedido. Si el proveedor manda 8 de 10 y sumáramos
 * 10, el inventario miente — y un inventario que miente es peor que no tener
 * inventario, porque la gente le cree.
 */
describe("órdenes de compra", () => {
  let app: INestApplication;
  let orders: PurchaseOrdersService;
  let requisitions: RequisitionsService;
  let coord1: AuthenticatedUser;
  let bodega: AuthenticatedUser;
  let compras: AuthenticatedUser;
  let warehouseId: string;
  let itemId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
    orders = app.get(PurchaseOrdersService);
    requisitions = app.get(RequisitionsService);

    const load = async (email: string): Promise<AuthenticatedUser> => {
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      return { id: u.id, email: u.email, role: u.role, contractId: u.contractId };
    };
    coord1 = await load("coord1@asofer.com");
    bodega = await load("bodega@asofer.com");
    compras = await load("compras@asofer.com");

    warehouseId = (
      await prisma.warehouse.findUniqueOrThrow({ where: { contractId: coord1.contractId ?? "" } })
    ).id;
    itemId = (await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Deja una OC pendiente por `missing` unidades. */
  async function makePendingOrder(requested: number, inStock: number) {
    await prisma.stock.update({
      where: { warehouseId_itemId: { warehouseId, itemId } },
      data: { quantity: inStock },
    });
    const req = await requisitions.create(coord1, {
      lines: [{ itemId, quantity: requested, justification: "Obra", type: "MATERIAL_OBRA" }],
    });
    await requisitions.submit(coord1, req.id);
    const result = await requisitions.verifyStock(bodega, req.id);
    if (!result.purchaseOrder) throw new Error("se esperaba una OC");
    return prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: result.purchaseOrder.id },
      include: { lines: true },
    });
  }

  it("5.6: solo el PURCHASING_MANAGER puede aprobar", async () => {
    const po = await makePendingOrder(10, 0);

    await expect(orders.approve(coord1, po.id, {})).rejects.toThrow(ForbiddenException);
    await expect(orders.approve(bodega, po.id, {})).rejects.toThrow(ForbiddenException);

    const aprobada = await orders.approve(compras, po.id, {});
    expect(aprobada.status).toBe("APROBADA");
    expect(aprobada.approvedById).toBe(compras.id);
  });

  it("5.6: al aprobar se pueden ajustar precios y cantidades", async () => {
    const po = await makePendingOrder(10, 0);
    const line = po.lines[0]!;

    const aprobada = await orders.approve(compras, po.id, {
      lines: [{ lineId: line.id, unitPrice: 2500.75, orderedQty: 8 }],
    });

    const actualizada = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: { id: line.id },
    });
    expect(Number(actualizada.unitPrice)).toBe(2500.75);
    expect(actualizada.orderedQty).toBe(8);
    expect(aprobada.status).toBe("APROBADA");
  });

  it("5.6: el rechazo EXIGE motivo", async () => {
    const po = await makePendingOrder(5, 0);

    await expect(orders.reject(compras, po.id, "")).rejects.toThrow(BadRequestException);

    const rechazada = await orders.reject(compras, po.id, "Precio fuera de presupuesto");
    expect(rechazada.status).toBe("RECHAZADA");
    expect(rechazada.rejectionReason).toBe("Precio fuera de presupuesto");
  });

  it("5.7 / ADR-003: recepción PARCIAL — OC de 10, llegan 8 → suma 8, quedan 2", async () => {
    const po = await makePendingOrder(10, 0);
    const line = po.lines[0]!;
    expect(line.orderedQty).toBe(10);

    await orders.approve(compras, po.id, {
      lines: [{ lineId: line.id, unitPrice: 100 }],
    });

    const antes = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId, itemId } },
    });

    const recibida = await orders.receive(bodega, po.id, {
      lines: [{ lineId: line.id, receivedQty: 8 }],
    });

    // Sumó 8, NO 10.
    const despues = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId, itemId } },
    });
    expect(despues.quantity).toBe(antes.quantity + 8);

    // Y quedan 2 pendientes, visibles.
    const actualizada = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: { id: line.id },
    });
    expect(actualizada.receivedQty).toBe(8);
    expect(actualizada.orderedQty - actualizada.receivedQty).toBe(2);
    expect(recibida.status).toBe("RECIBIDA_PARCIAL");
  });

  it("5.7: la recepción completa marca RECIBIDA_TOTAL", async () => {
    const po = await makePendingOrder(6, 0);
    const line = po.lines[0]!;
    await orders.approve(compras, po.id, { lines: [{ lineId: line.id, unitPrice: 50 }] });

    const recibida = await orders.receive(bodega, po.id, {
      lines: [{ lineId: line.id, receivedQty: 6 }],
    });
    expect(recibida.status).toBe("RECIBIDA_TOTAL");
  });

  it("5.7: no se puede recibir MÁS de lo pedido", async () => {
    const po = await makePendingOrder(4, 0);
    const line = po.lines[0]!;
    await orders.approve(compras, po.id, { lines: [{ lineId: line.id, unitPrice: 10 }] });

    await expect(
      orders.receive(bodega, po.id, { lines: [{ lineId: line.id, receivedQty: 5 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it("5.7: no se puede recibir una OC que no fue aprobada", async () => {
    const po = await makePendingOrder(3, 0);
    await expect(
      orders.receive(bodega, po.id, { lines: [{ lineId: po.lines[0]!.id, receivedQty: 3 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it("5.8: la entrega final queda registrada contra el empleado receptor", async () => {
    const employee = await prisma.employee.findFirstOrThrow({
      where: { contractId: coord1.contractId ?? "" },
    });

    // Sembrar stock explícitamente: la entrega descuenta de bodega y los
    // tests anteriores la dejaron en cero. Sin esto el fallo parecería del
    // módulo de entregas cuando en realidad es setup incompleto.
    await prisma.stock.update({
      where: { warehouseId_itemId: { warehouseId, itemId } },
      data: { quantity: 20 },
    });

    const log = await orders.deliver(bodega, {
      contractId: coord1.contractId!,
      itemId,
      employeeId: employee.id,
      quantity: 2,
    });

    expect(log.employeeId).toBe(employee.id);
    expect(log.quantity).toBe(2);

    const historial = await prisma.deliveryLog.findMany({
      where: { employeeId: employee.id },
    });
    expect(historial.length).toBeGreaterThan(0);
  });

  it("5.8: la entrega descuenta del stock de la bodega del contrato", async () => {
    await prisma.stock.update({
      where: { warehouseId_itemId: { warehouseId, itemId } },
      data: { quantity: 10 },
    });

    await orders.deliver(bodega, {
      contractId: coord1.contractId!,
      itemId,
      quantity: 3,
    });

    const stock = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId, itemId } },
    });
    expect(stock.quantity).toBe(7);
  });
});
