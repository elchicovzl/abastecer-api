import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma, resetDatabase } from "./db";

/**
 * Tarea 2.5 — PurchaseOrder/Line, DeliveryLog y AuditLog.
 *
 * La pieza clave es `receivedQty` separada de `orderedQty` (ADR-003): el stock
 * se suma por lo EFECTIVAMENTE recibido, no por lo pedido. Si el proveedor
 * manda 8 de 10, la diferencia tiene que quedar visible, no perdida.
 */
async function seedBase(code: string) {
  const contract = await prisma.contract.create({ data: { code, name: `Obra ${code}` } });
  const user = await prisma.user.create({
    data: {
      email: `u-${code}@asofer.com`,
      passwordHash: "hash",
      name: `Usuario ${code}`,
      role: "PURCHASING_MANAGER",
    },
  });
  const item = await prisma.item.create({
    data: { sku: `SKU-${code}`, name: `Ítem ${code}`, category: "MATERIALES", unit: "u" },
  });
  const employee = await prisma.employee.create({
    data: { documentId: `DOC-${code}`, name: `Empleado ${code}`, contractId: contract.id },
  });
  const requisition = await prisma.requisition.create({
    data: { contractId: contract.id, requesterId: user.id },
  });
  return { contract, user, item, employee, requisition };
}

describe("órdenes de compra, entregas y auditoría", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("la OC nace pendiente y sin cantidades recibidas", async () => {
    const { contract, requisition, item } = await seedBase("C-301");

    const po = await prisma.purchaseOrder.create({
      data: {
        contractId: contract.id,
        requisitionId: requisition.id,
        lines: {
          create: [{ itemId: item.id, orderedQty: 10, unitPrice: "1500.50" }],
        },
      },
      include: { lines: true },
    });

    expect(po.status).toBe("PENDIENTE");
    expect(po.lines).toHaveLength(1);
    expect(po.lines[0]?.orderedQty).toBe(10);
    // ADR-003: nada se recibió todavía.
    expect(po.lines[0]?.receivedQty).toBe(0);
  });

  it("ADR-003: la recepción parcial deja el faltante visible", async () => {
    const { contract, requisition, item } = await seedBase("C-302");
    const po = await prisma.purchaseOrder.create({
      data: {
        contractId: contract.id,
        requisitionId: requisition.id,
        lines: { create: [{ itemId: item.id, orderedQty: 10, unitPrice: "100.00" }] },
      },
      include: { lines: true },
    });

    const line = po.lines[0];
    if (!line) throw new Error("la OC debería tener una línea");

    await prisma.purchaseOrderLine.update({
      where: { id: line.id },
      data: { receivedQty: 8 },
    });

    const updated = await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(updated.orderedQty).toBe(10);
    expect(updated.receivedQty).toBe(8);
    // Quedan 2 pendientes, y el sistema lo puede calcular sin adivinar.
    expect(updated.orderedQty - updated.receivedQty).toBe(2);
  });

  it("no se puede recibir MÁS de lo pedido", async () => {
    const { contract, requisition, item } = await seedBase("C-303");
    const po = await prisma.purchaseOrder.create({
      data: {
        contractId: contract.id,
        requisitionId: requisition.id,
        lines: { create: [{ itemId: item.id, orderedQty: 5, unitPrice: "10.00" }] },
      },
      include: { lines: true },
    });
    const line = po.lines[0];
    if (!line) throw new Error("la OC debería tener una línea");

    await expect(
      prisma.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQty: 6 },
      }),
    ).rejects.toThrow();
  });

  it("el rechazo de una OC exige motivo", async () => {
    const { contract, requisition } = await seedBase("C-304");
    const po = await prisma.purchaseOrder.create({
      data: { contractId: contract.id, requisitionId: requisition.id },
    });

    await expect(
      prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: "RECHAZADA" },
      }),
    ).rejects.toThrow();

    const conMotivo = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "RECHAZADA", rejectionReason: "Precio fuera de presupuesto" },
    });
    expect(conMotivo.rejectionReason).toBe("Precio fuera de presupuesto");
  });

  it("la entrega de dotación queda trazada contra el empleado receptor", async () => {
    const { contract, employee, item, user } = await seedBase("C-305");

    await prisma.deliveryLog.create({
      data: {
        contractId: contract.id,
        itemId: item.id,
        employeeId: employee.id,
        quantity: 2,
        deliveredById: user.id,
      },
    });

    const historial = await prisma.deliveryLog.findMany({
      where: { employeeId: employee.id },
      include: { item: true },
    });

    expect(historial).toHaveLength(1);
    expect(historial[0]?.quantity).toBe(2);
    expect(historial[0]?.item.name).toBe("Ítem C-305");
  });

  it("la auditoría guarda quién, qué y el antes/después", async () => {
    const { user, requisition } = await seedBase("C-306");

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        entity: "Requisition",
        entityId: requisition.id,
        action: "STATUS_CHANGE",
        before: { status: "BORRADOR" },
        after: { status: "PENDIENTE_INVENTARIO" },
      },
    });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: requisition.id },
    });

    expect(log.action).toBe("STATUS_CHANGE");
    expect(log.userId).toBe(user.id);
    expect(log.before).toEqual({ status: "BORRADOR" });
    expect(log.after).toEqual({ status: "PENDIENTE_INVENTARIO" });
  });
});
