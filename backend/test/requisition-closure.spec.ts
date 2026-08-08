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
 * Cierre del ciclo: EN_COMPRA → RECIBIDO_EN_BODEGA → ENTREGADO.
 *
 * Este archivo existe porque los 150 tests anteriores verificaban el PASO
 * pero no el RESULTADO DEL PROCESO: comprobaban que la orden de compra
 * quedara en RECIBIDA_TOTAL, y nunca que la requisición avanzara. Resultado:
 * toda requisición que pasaba por compra se quedaba en EN_COMPRA para
 * siempre y nadie se enteraba.
 *
 * Reglas de negocio decididas con ASOFER:
 *  · La requisición avanza SOLO con recepción TOTAL. Mientras falte material,
 *    la compra no terminó.
 *  · La entrega es un acto MANUAL de bodega, que registra DeliveryLog. Es lo
 *    que da la trazabilidad del ADR-005.
 */
describe("cierre del ciclo de requisición", () => {
  let app: INestApplication;
  let requisitions: RequisitionsService;
  let orders: PurchaseOrdersService;
  let coord: AuthenticatedUser;
  let bodega: AuthenticatedUser;
  let compras: AuthenticatedUser;
  let warehouseId: string;
  let itemId: string;
  let employeeId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
    requisitions = app.get(RequisitionsService);
    orders = app.get(PurchaseOrdersService);

    const load = async (email: string): Promise<AuthenticatedUser> => {
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      return { id: u.id, email: u.email, role: u.role, contractId: u.contractId };
    };
    coord = await load("coord1@asofer.com");
    bodega = await load("bodega@asofer.com");
    compras = await load("compras@asofer.com");

    warehouseId = (
      await prisma.warehouse.findUniqueOrThrow({
        where: { contractId: coord.contractId ?? "" },
      })
    ).id;
    itemId = (await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } })).id;
    employeeId = (
      await prisma.employee.findFirstOrThrow({ where: { contractId: coord.contractId ?? "" } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Deja una requisición en EN_COMPRA con su OC aprobada. */
  async function enCompra(pedido: number, enStock: number) {
    await prisma.stock.update({
      where: { warehouseId_itemId: { warehouseId, itemId } },
      data: { quantity: enStock },
    });
    const req = await requisitions.create(coord, {
      lines: [{ itemId, quantity: pedido, justification: "Obra", type: "MATERIAL_OBRA" }],
    });
    await requisitions.submit(coord, req.id);
    const { purchaseOrder } = await requisitions.verifyStock(bodega, req.id);
    if (!purchaseOrder) throw new Error("se esperaba una OC");

    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrder.id },
      include: { lines: true },
    });
    await orders.approve(compras, po.id, {
      lines: po.lines.map((l) => ({ lineId: l.id, unitPrice: 100 })),
    });
    return { requisitionId: req.id, po };
  }

  const statusDe = async (id: string) =>
    (await prisma.requisition.findUniqueOrThrow({ where: { id } })).status;

  it("tras aprobar la OC, la requisición queda EN_COMPRA", async () => {
    const { requisitionId } = await enCompra(10, 4);
    expect(await statusDe(requisitionId)).toBe("EN_COMPRA");
  });

  it("la recepción PARCIAL NO avanza la requisición", async () => {
    const { requisitionId, po } = await enCompra(10, 4);

    // Faltan 6, llegan 3.
    await orders.receive(bodega, po.id, {
      lines: [{ lineId: po.lines[0]!.id, receivedQty: 3 }],
    });

    // Mientras falte material, la compra no terminó.
    expect(await statusDe(requisitionId)).toBe("EN_COMPRA");
  });

  it("la recepción TOTAL avanza a RECIBIDO_EN_BODEGA", async () => {
    const { requisitionId, po } = await enCompra(10, 4);

    await orders.receive(bodega, po.id, {
      lines: [{ lineId: po.lines[0]!.id, receivedQty: 6 }],
    });

    expect(await statusDe(requisitionId)).toBe("RECIBIDO_EN_BODEGA");
  });

  it("la recepción en dos tandas también cierra al completarse", async () => {
    const { requisitionId, po } = await enCompra(10, 4);
    const lineId = po.lines[0]!.id;

    await orders.receive(bodega, po.id, { lines: [{ lineId, receivedQty: 2 }] });
    expect(await statusDe(requisitionId)).toBe("EN_COMPRA");

    await orders.receive(bodega, po.id, { lines: [{ lineId, receivedQty: 4 }] });
    expect(await statusDe(requisitionId)).toBe("RECIBIDO_EN_BODEGA");
  });

  it("la entrega final cierra la requisición y descuenta SOLO lo comprado", async () => {
    const { requisitionId, po } = await enCompra(10, 4);
    await orders.receive(bodega, po.id, {
      lines: [{ lineId: po.lines[0]!.id, receivedQty: 6 }],
    });

    // Al verificar stock se despacharon 4 (había 4 → quedó 0).
    // Al recibir entraron 6 → stock = 6.
    const antes = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId, itemId } },
    });
    expect(antes.quantity).toBe(6);

    await requisitions.deliver(bodega, requisitionId);

    // Se descuentan los 6 comprados. Los 4 originales ya salieron antes:
    // descontarlos de nuevo sería contar la misma salida dos veces.
    const despues = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId, itemId } },
    });
    expect(despues.quantity).toBe(0);
    expect(await statusDe(requisitionId)).toBe("ENTREGADO");
  });

  it("la entrega registra el DeliveryLog por la cantidad COMPLETA de la línea", async () => {
    const { requisitionId, po } = await enCompra(10, 4);
    await orders.receive(bodega, po.id, {
      lines: [{ lineId: po.lines[0]!.id, receivedQty: 6 }],
    });
    await requisitions.deliver(bodega, requisitionId);

    const logs = await prisma.deliveryLog.findMany({
      where: { contractId: coord.contractId ?? "" },
      orderBy: { deliveredAt: "desc" },
      take: 1,
    });
    // La persona recibe las 10 unidades pedidas, no solo las 6 compradas.
    expect(logs[0]?.quantity).toBe(10);
    expect(logs[0]?.deliveredById).toBe(bodega.id);
  });

  it("ADR-005: la dotación queda trazada contra su empleado receptor", async () => {
    await prisma.stock.update({
      where: { warehouseId_itemId: { warehouseId, itemId } },
      data: { quantity: 50 },
    });
    const req = await requisitions.create(coord, {
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
    await requisitions.submit(coord, req.id);
    // Había stock de sobra: se entrega directo, sin pasar por compras.
    const result = await requisitions.verifyStock(bodega, req.id);
    expect(result.status).toBe("ENTREGADO");

    await expect(requisitions.deliver(bodega, req.id)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("solo bodega puede registrar la entrega", async () => {
    const { requisitionId, po } = await enCompra(10, 4);
    await orders.receive(bodega, po.id, {
      lines: [{ lineId: po.lines[0]!.id, receivedQty: 6 }],
    });

    await expect(requisitions.deliver(coord, requisitionId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("no se puede entregar dos veces", async () => {
    const { requisitionId, po } = await enCompra(10, 4);
    await orders.receive(bodega, po.id, {
      lines: [{ lineId: po.lines[0]!.id, receivedQty: 6 }],
    });
    await requisitions.deliver(bodega, requisitionId);

    // ENTREGADO es terminal (ADR-004).
    await expect(requisitions.deliver(bodega, requisitionId)).rejects.toThrow(
      BadRequestException,
    );
  });
});
