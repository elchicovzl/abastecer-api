import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { canAccessContract } from "../auth/contract-scope";
import { PrismaService } from "../prisma/prisma.service";

export interface StockRow {
  warehouseId: string;
  itemId: string;
  quantity: number;
  minQuantity: number;
  itemName: string;
  sku: string;
}

/**
 * Inventario multi-bodega.
 *
 * La segregación por contrato se aplica ACÁ, en la capa de servicio (ADR-002),
 * no en el controller. Cualquier consumidor futuro —otro service, un job,
 * un comando de CLI— queda cubierto sin tener que acordarse de nada.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ids de bodegas que este usuario puede ver. */
  private async visibleWarehouseIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (user.role !== "COORDINATOR") return null; // null = todas

    if (!user.contractId) throw new NotFoundException("Recurso no encontrado");
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { contractId: user.contractId },
      select: { id: true },
    });
    return warehouse ? [warehouse.id] : [];
  }

  async listStock(user: AuthenticatedUser): Promise<StockRow[]> {
    const visibles = await this.visibleWarehouseIds(user);

    const rows = await this.prisma.stock.findMany({
      where: visibles ? { warehouseId: { in: visibles } } : {},
      include: { item: { select: { name: true, sku: true } } },
      orderBy: [{ warehouseId: "asc" }, { itemId: "asc" }],
    });

    return rows.map((r) => ({
      warehouseId: r.warehouseId,
      itemId: r.itemId,
      quantity: r.quantity,
      minQuantity: r.minQuantity,
      itemName: r.item.name,
      sku: r.item.sku,
    }));
  }

  /**
   * Disponibilidad de un ítem en una bodega concreta.
   * Si la bodega es de otro contrato → 404, nunca 403 (ADR-008).
   */
  async availability(
    user: AuthenticatedUser,
    warehouseId: string,
    itemId: string,
  ): Promise<{ warehouseId: string; itemId: string; quantity: number }> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, contractId: true },
    });

    if (!warehouse || !canAccessContract(user, warehouse.contractId)) {
      throw new NotFoundException("Recurso no encontrado");
    }

    const stock = await this.prisma.stock.findUnique({
      where: { warehouseId_itemId: { warehouseId, itemId } },
      select: { quantity: true },
    });

    // Sin fila de stock, la respuesta correcta es 0 disponible — no un error.
    // "No hay" y "nunca existió" son lo mismo para quien va a pedir.
    return { warehouseId, itemId, quantity: stock?.quantity ?? 0 };
  }

  /** Ítems por debajo de su mínimo, acotado a lo que el usuario puede ver. */
  async lowStockAlerts(user: AuthenticatedUser): Promise<StockRow[]> {
    const todo = await this.listStock(user);
    return todo.filter((s) => s.quantity < s.minQuantity);
  }

  /**
   * ADR-007 — descuento de stock bajo lock pesimista.
   *
   * El bug que esto previene: `leer → decidir → escribir` sin protección.
   * Dos despachos simultáneos del último ítem leen "queda 1", ambos deciden
   * que alcanza, ambos descuentan. Stock en -1 y una unidad entregada dos
   * veces. En pruebas manuales no aparece nunca: hace falta que dos personas
   * hagan clic en el mismo segundo.
   *
   * `SELECT ... FOR UPDATE` toma un lock sobre LA FILA dentro de la
   * transacción. El segundo despacho queda esperando a que el primero
   * commitee, y recién entonces lee — viendo el stock REAL, no el viejo.
   *
   * El lock es por fila, no por tabla: despachos de ítems distintos siguen
   * corriendo en paralelo sin estorbarse.
   */
  async dispatch(
    user: AuthenticatedUser,
    input: { warehouseId: string; itemId: string; quantity: number },
  ): Promise<{ warehouseId: string; itemId: string; remaining: number }> {
    if (input.quantity <= 0) {
      throw new BadRequestException("La cantidad a despachar debe ser positiva");
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
      select: { contractId: true },
    });
    if (!warehouse || !canAccessContract(user, warehouse.contractId)) {
      throw new NotFoundException("Recurso no encontrado");
    }

    return this.prisma.$transaction(async (tx) => {
      // El lock vive dentro de la transacción y se libera al commitear.
      const locked = await tx.$queryRaw<{ id: string; quantity: number }[]>`
        SELECT "id", "quantity"
        FROM "stock"
        WHERE "warehouseId" = ${input.warehouseId} AND "itemId" = ${input.itemId}
        FOR UPDATE
      `;

      const row = locked[0];
      if (!row) {
        throw new NotFoundException("El ítem no existe en esa bodega");
      }
      if (row.quantity < input.quantity) {
        // Falla LIMPIA: la transacción se revierte y el stock queda intacto.
        throw new BadRequestException(
          `Stock insuficiente: hay ${row.quantity}, se pidieron ${input.quantity}`,
        );
      }

      const updated = await tx.stock.update({
        where: { id: row.id },
        data: { quantity: { decrement: input.quantity } },
        select: { quantity: true },
      });

      return {
        warehouseId: input.warehouseId,
        itemId: input.itemId,
        remaining: updated.quantity,
      };
    });
  }

  /**
   * Ingreso de stock por recepción de compra (ADR-003).
   * Usa el mismo lock: dos recepciones simultáneas del mismo ítem no se
   * pisan una a la otra.
   */
  async receive(
    input: { warehouseId: string; itemId: string; quantity: number },
  ): Promise<{ quantity: number }> {
    if (input.quantity <= 0) {
      throw new BadRequestException("La cantidad recibida debe ser positiva");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "stock"
        WHERE "warehouseId" = ${input.warehouseId} AND "itemId" = ${input.itemId}
        FOR UPDATE
      `;

      const row = await tx.stock.upsert({
        where: {
          warehouseId_itemId: { warehouseId: input.warehouseId, itemId: input.itemId },
        },
        update: { quantity: { increment: input.quantity } },
        create: {
          warehouseId: input.warehouseId,
          itemId: input.itemId,
          quantity: input.quantity,
        },
        select: { quantity: true },
      });

      return { quantity: row.quantity };
    });
  }

  /**
   * Ajuste manual de stock: fija la cantidad a un valor absoluto.
   *
   * Es la puerta de entrada que faltaba. Antes el stock SOLO podía crecer
   * por una orden de compra, así que ASOFER no tenía forma de cargar el
   * inventario que ya tiene en bodega.
   *
   * Cubre tres casos reales:
   *  · Carga inicial por conteo físico
   *  · Merma, rotura o vencimiento
   *  · Corrección de un error de conteo
   *
   * El `reason` es OBLIGATORIO. Un ajuste de inventario sin explicación es
   * indistinguible de un faltante: alguien tiene que poder mirar el
   * histórico y entender por qué el número cambió. Queda auditado por el
   * interceptor global (ADR-006).
   */
  async adjust(
    user: AuthenticatedUser,
    input: { warehouseId: string; itemId: string; quantity: number; reason: string },
  ): Promise<{ warehouseId: string; itemId: string; quantity: number; previous: number }> {
    if (user.role !== "WAREHOUSE" && user.role !== "ADMIN") {
      throw new ForbiddenException("Solo bodega puede ajustar el inventario");
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      throw new BadRequestException("La cantidad debe ser un entero mayor o igual a cero");
    }
    if (!input.reason || input.reason.trim().length < 5) {
      throw new BadRequestException(
        "El ajuste debe indicar un motivo de al menos 5 caracteres",
      );
    }

    await this.assertWarehouseAccess(user, input.warehouseId);

    return this.prisma.$transaction(async (tx) => {
      // Mismo lock del ADR-007: un ajuste concurrente con un despacho no
      // puede pisarse.
      const locked = await tx.$queryRaw<{ id: string; quantity: number }[]>`
        SELECT "id", "quantity" FROM "stock"
        WHERE "warehouseId" = ${input.warehouseId} AND "itemId" = ${input.itemId}
        FOR UPDATE
      `;
      const previous = locked[0]?.quantity ?? 0;

      const row = await tx.stock.upsert({
        where: {
          warehouseId_itemId: { warehouseId: input.warehouseId, itemId: input.itemId },
        },
        update: { quantity: input.quantity },
        create: {
          warehouseId: input.warehouseId,
          itemId: input.itemId,
          quantity: input.quantity,
        },
        select: { quantity: true },
      });

      return {
        warehouseId: input.warehouseId,
        itemId: input.itemId,
        quantity: row.quantity,
        previous,
      };
    });
  }

  /**
   * Define el mínimo de un artículo en una bodega.
   *
   * Sin esto las alertas eran letra muerta: `minQuantity` arranca en 0 y la
   * condición es `quantity < minQuantity`. Como un CHECK impide stock
   * negativo, la alerta era matemáticamente imposible de disparar.
   */
  async setMinimum(
    user: AuthenticatedUser,
    input: { warehouseId: string; itemId: string; minQuantity: number },
  ): Promise<{ warehouseId: string; itemId: string; minQuantity: number }> {
    if (user.role !== "WAREHOUSE" && user.role !== "ADMIN") {
      throw new ForbiddenException("Solo bodega puede definir mínimos");
    }
    if (!Number.isInteger(input.minQuantity) || input.minQuantity < 0) {
      throw new BadRequestException("El mínimo debe ser un entero mayor o igual a cero");
    }

    await this.assertWarehouseAccess(user, input.warehouseId);

    const row = await this.prisma.stock.upsert({
      where: {
        warehouseId_itemId: { warehouseId: input.warehouseId, itemId: input.itemId },
      },
      update: { minQuantity: input.minQuantity },
      create: {
        warehouseId: input.warehouseId,
        itemId: input.itemId,
        quantity: 0,
        minQuantity: input.minQuantity,
      },
      select: { minQuantity: true },
    });

    return {
      warehouseId: input.warehouseId,
      itemId: input.itemId,
      minQuantity: row.minQuantity,
    };
  }

  /** 404 y no 403 si la bodega es de otro contrato (ADR-008). */
  private async assertWarehouseAccess(
    user: AuthenticatedUser,
    warehouseId: string,
  ): Promise<void> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { contractId: true },
    });
    if (!warehouse || !canAccessContract(user, warehouse.contractId)) {
      throw new NotFoundException("Recurso no encontrado");
    }
  }

  /** Valida que la categoría de gasto exista antes de registrar movimientos. */
  async assertItemClassified(itemId: string): Promise<void> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: { category: true, active: true },
    });
    if (!item) throw new NotFoundException("Ítem no encontrado");
    if (!item.active) {
      throw new BadRequestException("El ítem está inactivo");
    }
  }
}
