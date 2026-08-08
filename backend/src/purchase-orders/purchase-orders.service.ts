import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { assertContractAccess, contractScopeWhere } from "../auth/contract-scope";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import type { ApproveOrderInput, ReceiveOrderInput } from "../requisitions/requisitions.dto";
import { assertTransition } from "../requisitions/state-machine";

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async list(user: AuthenticatedUser) {
    return this.prisma.purchaseOrder.findMany({
      where: contractScopeWhere(user),
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Tarea 5.6 — solo el jefe de compras aprueba, y puede ajustar precio y
   * cantidad. El precio real lo conoce él: es quien negocia con el proveedor.
   */
  async approve(user: AuthenticatedUser, id: string, input: ApproveOrderInput) {
    if (user.role !== "PURCHASING_MANAGER") {
      throw new ForbiddenException("Solo el jefe de compras puede aprobar órdenes");
    }

    const po = await this.findScoped(user, id);
    if (po.status !== "PENDIENTE") {
      throw new BadRequestException(`La orden ya está en estado ${po.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      for (const ajuste of input.lines ?? []) {
        await tx.purchaseOrderLine.update({
          where: { id: ajuste.lineId },
          data: {
            unitPrice: ajuste.unitPrice,
            ...(ajuste.orderedQty !== undefined ? { orderedQty: ajuste.orderedQty } : {}),
          },
        });
      }

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: "APROBADA", approvedById: user.id, approvedAt: new Date() },
      });

      // La requisición avanza a EN_COMPRA: ya hay una orden en la calle.
      assertTransition(
        (await tx.requisition.findUniqueOrThrow({ where: { id: po.requisitionId } })).status,
        "EN_COMPRA",
      );
      await tx.requisition.update({
        where: { id: po.requisitionId },
        data: { status: "EN_COMPRA" },
      });

      return updated;
    });
  }

  /** Tarea 5.6 — un rechazo sin motivo es inauditable. */
  async reject(user: AuthenticatedUser, id: string, reason: string) {
    if (user.role !== "PURCHASING_MANAGER") {
      throw new ForbiddenException("Solo el jefe de compras puede rechazar órdenes");
    }
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException("El rechazo debe indicar un motivo");
    }

    const po = await this.findScoped(user, id);
    if (po.status !== "PENDIENTE") {
      throw new BadRequestException(`La orden ya está en estado ${po.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: "RECHAZADA", rejectionReason: reason.trim() },
      });
      await tx.requisition.update({
        where: { id: po.requisitionId },
        data: { status: "RECHAZADA" },
      });
      return updated;
    });
  }

  /**
   * Tareas 5.7 / 5.8 — ADR-003.
   *
   * El stock se incrementa por lo EFECTIVAMENTE recibido. Si llegan 8 de 10,
   * se suman 8 y quedan 2 pendientes a la vista. Sumar 10 haría que el
   * inventario mienta, y la gente le cree al inventario.
   */
  async receive(user: AuthenticatedUser, id: string, input: ReceiveOrderInput) {
    if (user.role !== "WAREHOUSE" && user.role !== "ADMIN") {
      throw new ForbiddenException("Solo bodega puede registrar recepciones");
    }

    const po = await this.findScoped(user, id);
    if (po.status !== "APROBADA" && po.status !== "RECIBIDA_PARCIAL") {
      throw new BadRequestException(
        `No se puede recibir una orden en estado ${po.status}`,
      );
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { contractId: po.contractId },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException("El contrato no tiene bodega asignada");

    for (const l of input.lines) {
      const line = po.lines.find((x) => x.id === l.lineId);
      if (!line) throw new NotFoundException("Línea de orden no encontrada");
      if (line.receivedQty + l.receivedQty > line.orderedQty) {
        throw new BadRequestException(
          `No se puede recibir más de lo pedido: la línea pidió ${line.orderedQty}`,
        );
      }
    }

    for (const l of input.lines) {
      const line = po.lines.find((x) => x.id === l.lineId)!;
      await this.prisma.purchaseOrderLine.update({
        where: { id: l.lineId },
        data: { receivedQty: { increment: l.receivedQty } },
      });
      if (l.receivedQty > 0) {
        await this.inventory.receive({
          warehouseId: warehouse.id,
          itemId: line.itemId,
          quantity: l.receivedQty,
        });
      }
    }

    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: id },
    });
    const completa = lines.every((l) => l.receivedQty >= l.orderedQty);

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: completa ? "RECIBIDA_TOTAL" : "RECIBIDA_PARCIAL" },
    });

    // Regla de negocio ASOFER: la requisición avanza SOLO con recepción
    // TOTAL. Mientras falte material, la compra no terminó — y dejarla
    // avanzar haría creer que el pedido está listo cuando no llegó entero.
    //
    // Antes esto no existía: `receive()` actualizaba la OC y se olvidaba de
    // la requisición, que quedaba en EN_COMPRA para siempre. Los tests
    // verificaban el paso (estado de la OC) pero no el resultado del
    // proceso (estado de la requisición).
    if (completa) {
      const requisition = await this.prisma.requisition.findUniqueOrThrow({
        where: { id: po.requisitionId },
      });
      if (requisition.status === "EN_COMPRA") {
        assertTransition(requisition.status, "RECIBIDO_EN_BODEGA");
        await this.prisma.requisition.update({
          where: { id: po.requisitionId },
          data: { status: "RECIBIDO_EN_BODEGA" },
        });
      }
    }

    return updated;
  }

  /** Tarea 5.8 — entrega final con trazabilidad de dotación. */
  async deliver(
    user: AuthenticatedUser,
    input: { contractId: string; itemId: string; employeeId?: string; quantity: number },
  ) {
    if (user.role !== "WAREHOUSE" && user.role !== "ADMIN") {
      throw new ForbiddenException("Solo bodega puede registrar entregas");
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { contractId: input.contractId },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException("El contrato no tiene bodega asignada");

    // El descuento pasa por el mismo lock del ADR-007.
    await this.inventory.dispatch(user, {
      warehouseId: warehouse.id,
      itemId: input.itemId,
      quantity: input.quantity,
    });

    return this.prisma.deliveryLog.create({
      data: {
        contractId: input.contractId,
        itemId: input.itemId,
        employeeId: input.employeeId ?? null,
        quantity: input.quantity,
        deliveredById: user.id,
      },
    });
  }

  private async findScoped(user: AuthenticatedUser, id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    assertContractAccess(user, po);
    return po;
  }
}
