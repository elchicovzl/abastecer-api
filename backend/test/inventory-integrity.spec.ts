import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import type { AuthenticatedUser } from "../src/auth/auth.types";
import { InventoryService } from "../src/inventory/inventory.service";
import { PurchaseOrdersService } from "../src/purchase-orders/purchase-orders.service";
import { RequisitionsService } from "../src/requisitions/requisitions.service";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";

/**
 * Integridad del inventario.
 *
 * EL BUG QUE ORIGINA ESTE ARCHIVO: el coordinador pidió 1 casco, compras
 * compró 5 aprovechando precio por volumen, bodega recibió 5 y al entregar
 * el sistema descontó las 5. **Las otras 4 se evaporaron del inventario.**
 *
 * Causa de fondo: `deliver()` descontaba lo COMPRADO en vez de lo que
 * realmente sale de bodega. Y faltaba el dato clave — cuánto se despachó en
 * la verificación — sin el cual no se puede calcular la diferencia.
 *
 * Un sistema de inventario que pierde unidades es peor que no tener
 * sistema: la gente le cree.
 */
describe("integridad del inventario", () => {
  let app: INestApplication;
  let requisitions: RequisitionsService;
  let orders: PurchaseOrdersService;
  let coord: AuthenticatedUser;
  let bodega: AuthenticatedUser;
  let compras: AuthenticatedUser;
  let warehouseId: string;
  let itemId: string;

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
    itemId = (await prisma.item.findFirstOrThrow({ where: { sku: "DOT-001" } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const setStock = (quantity: number, minQuantity = 0) =>
    prisma.stock.upsert({
      where: { warehouseId_itemId: { warehouseId, itemId } },
      update: { quantity, minQuantity },
      create: { warehouseId, itemId, quantity, minQuantity },
    });

  const stockActual = async () =>
    (
      await prisma.stock.findUniqueOrThrow({
        where: { warehouseId_itemId: { warehouseId, itemId } },
      })
    ).quantity;

  it("EL CASO REPORTADO: pide 1, compras compra 5, entrega 1 → quedan 4", async () => {
    await setStock(0);

    const req = await requisitions.create(coord, {
      lines: [{ itemId, quantity: 1, justification: "Casco", type: "HERRAMIENTA_EQUIPO" }],
    });
    await requisitions.submit(coord, req.id);
    const { purchaseOrder } = await requisitions.verifyStock(bodega, req.id);
    if (!purchaseOrder) throw new Error("se esperaba una OC");

    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrder.id },
      include: { lines: true },
    });

    // Compras aprovecha precio por volumen: compra 5 en vez de 1.
    await orders.approve(compras, po.id, {
      lines: [{ lineId: po.lines[0]!.id, unitPrice: 20000, orderedQty: 5 }],
    });
    await orders.receive(bodega, po.id, {
      lines: [{ lineId: po.lines[0]!.id, receivedQty: 5 }],
    });

    expect(await stockActual()).toBe(5);

    await requisitions.deliver(bodega, req.id);

    // Sale UNA: la que se pidió. Las otras 4 quedan disponibles en bodega
    // para la próxima requisición — que es justamente para lo que se
    // compró de más.
    expect(await stockActual()).toBe(4);
  });

  it("cobertura parcial: pide 10, hay 4, compra 6 → sale lo pedido, no sobra ni falta", async () => {
    await setStock(4);

    const req = await requisitions.create(coord, {
      lines: [{ itemId, quantity: 10, justification: "Cascos", type: "HERRAMIENTA_EQUIPO" }],
    });
    await requisitions.submit(coord, req.id);
    const { purchaseOrder } = await requisitions.verifyStock(bodega, req.id);

    // La verificación ya despachó los 4 que había.
    expect(await stockActual()).toBe(0);

    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrder!.id },
      include: { lines: true },
    });
    expect(po.lines[0]?.orderedQty).toBe(6);

    await orders.approve(compras, po.id, {
      lines: [{ lineId: po.lines[0]!.id, unitPrice: 1000 }],
    });
    await orders.receive(bodega, po.id, {
      lines: [{ lineId: po.lines[0]!.id, receivedQty: 6 }],
    });
    expect(await stockActual()).toBe(6);

    await requisitions.deliver(bodega, req.id);

    // Salen los 6 que faltaban. Los 4 originales ya habían salido antes:
    // descontarlos otra vez sería contar la misma salida dos veces.
    expect(await stockActual()).toBe(0);
  });

  it("si había stock de sobra, la entrega no descuenta nada extra", async () => {
    await setStock(50);

    const req = await requisitions.create(coord, {
      lines: [{ itemId, quantity: 3, justification: "Cascos", type: "HERRAMIENTA_EQUIPO" }],
    });
    await requisitions.submit(coord, req.id);
    const result = await requisitions.verifyStock(bodega, req.id);

    // Con stock de sobra se entrega directo, sin pasar por compras.
    expect(result.status).toBe("ENTREGADO");
    expect(await stockActual()).toBe(47);
  });
});

describe("ingreso y ajuste manual de stock", () => {
  let app: INestApplication;
  let inventory: InventoryService;
  let bodega: AuthenticatedUser;
  let coord: AuthenticatedUser;
  let warehouseId: string;
  let itemId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
    inventory = app.get(InventoryService);

    const load = async (email: string): Promise<AuthenticatedUser> => {
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      return { id: u.id, email: u.email, role: u.role, contractId: u.contractId };
    };
    bodega = await load("bodega@asofer.com");
    coord = await load("coord1@asofer.com");

    warehouseId = (await prisma.warehouse.findFirstOrThrow()).id;
    itemId = (await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("carga inicial: fija la cantidad contada físicamente", async () => {
    const res = await inventory.adjust(bodega, {
      warehouseId,
      itemId,
      quantity: 120,
      reason: "Conteo físico inicial de bodega",
    });

    expect(res.quantity).toBe(120);
  });

  it("un ajuste hacia abajo registra la merma", async () => {
    await inventory.adjust(bodega, {
      warehouseId,
      itemId,
      quantity: 120,
      reason: "Conteo inicial",
    });

    const res = await inventory.adjust(bodega, {
      warehouseId,
      itemId,
      quantity: 115,
      reason: "5 bolsas rotas por humedad",
    });
    expect(res.quantity).toBe(115);
  });

  it("el motivo es OBLIGATORIO: un ajuste sin explicación es inauditable", async () => {
    await expect(
      inventory.adjust(bodega, { warehouseId, itemId, quantity: 50, reason: "" }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      inventory.adjust(bodega, { warehouseId, itemId, quantity: 50, reason: "ok" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("no se admiten cantidades negativas", async () => {
    await expect(
      inventory.adjust(bodega, {
        warehouseId,
        itemId,
        quantity: -5,
        reason: "Intento inválido",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("solo bodega y admin pueden ajustar stock", async () => {
    await expect(
      inventory.adjust(coord, {
        warehouseId,
        itemId,
        quantity: 10,
        reason: "El coordinador no debería poder",
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe("alertas de stock mínimo", () => {
  let app: INestApplication;
  let inventory: InventoryService;
  let bodega: AuthenticatedUser;
  let warehouseId: string;
  let itemId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
    inventory = app.get(InventoryService);

    const u = await prisma.user.findUniqueOrThrow({ where: { email: "bodega@asofer.com" } });
    bodega = { id: u.id, email: u.email, role: u.role, contractId: u.contractId };
    warehouseId = (await prisma.warehouse.findFirstOrThrow()).id;
    itemId = (await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("se puede definir el mínimo de un artículo por bodega", async () => {
    const res = await inventory.setMinimum(bodega, {
      warehouseId,
      itemId,
      minQuantity: 20,
    });
    expect(res.minQuantity).toBe(20);
  });

  it("con mínimo en 0 NUNCA hay alerta — por eso no servía de nada", async () => {
    await inventory.adjust(bodega, {
      warehouseId,
      itemId,
      quantity: 0,
      reason: "Vaciar para la prueba",
    });
    await inventory.setMinimum(bodega, { warehouseId, itemId, minQuantity: 0 });

    // El CHECK impide stock negativo, así que `quantity < 0` es imposible.
    //
    // Se filtra por bodega + ítem, no solo por ítem: bodega ve las 9
    // bodegas y el mismo artículo puede estar bajo mínimo en otra.
    const alertas = await inventory.lowStockAlerts(bodega);
    expect(
      alertas.some((a) => a.itemId === itemId && a.warehouseId === warehouseId),
    ).toBe(false);
  });

  it("con un mínimo definido, la alerta SÍ aparece", async () => {
    await inventory.setMinimum(bodega, { warehouseId, itemId, minQuantity: 20 });
    await inventory.adjust(bodega, {
      warehouseId,
      itemId,
      quantity: 15,
      reason: "Consumo de obra",
    });

    const alertas = await inventory.lowStockAlerts(bodega);
    const alerta = alertas.find(
      (a) => a.itemId === itemId && a.warehouseId === warehouseId,
    );
    expect(alerta).toBeDefined();
    expect(alerta?.quantity).toBe(15);
    expect(alerta?.minQuantity).toBe(20);
  });

  it("al reponer por encima del mínimo, la alerta desaparece", async () => {
    await inventory.setMinimum(bodega, { warehouseId, itemId, minQuantity: 20 });
    await inventory.adjust(bodega, {
      warehouseId,
      itemId,
      quantity: 25,
      reason: "Reposición",
    });

    const alertas = await inventory.lowStockAlerts(bodega);
    expect(
      alertas.some((a) => a.itemId === itemId && a.warehouseId === warehouseId),
    ).toBe(false);
  });
});
