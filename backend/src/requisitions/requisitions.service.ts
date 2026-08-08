import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { assertContractAccess, contractScopeWhere } from "../auth/contract-scope";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateRequisitionInput } from "./requisitions.dto";
import { assertTransition, nextStatusAfterStockCheck } from "./state-machine";

@Injectable()
export class RequisitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    return this.prisma.requisition.findMany({
      where: contractScopeWhere(user),
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Detalle con scope: si es de otro contrato, 404 y no 403 (ADR-008). */
  async detail(user: AuthenticatedUser, id: string) {
    const requisition = await this.prisma.requisition.findUnique({
      where: { id },
      include: { lines: true, purchaseOrders: { include: { lines: true } } },
    });
    assertContractAccess(user, requisition);
    return requisition;
  }

  async create(user: AuthenticatedUser, input: CreateRequisitionInput) {
    if (input.lines.length === 0) {
      throw new BadRequestException("La requisición debe tener al menos una línea");
    }
    if (!user.contractId) {
      throw new BadRequestException("El solicitante debe pertenecer a un contrato");
    }

    // ADR-005: dotación exige empleado receptor, y ese empleado tiene que ser
    // DEL MISMO CONTRATO. Sin esta segunda validación, un coordinador podría
    // cargarle dotación a alguien de otra obra.
    for (const line of input.lines) {
      if (line.type === "DOTACION_PERSONAL") {
        if (!line.employeeId) {
          throw new BadRequestException(
            "Las líneas de dotación deben indicar el empleado receptor",
          );
        }
        const employee = await this.prisma.employee.findUnique({
          where: { id: line.employeeId },
          select: { contractId: true },
        });
        assertContractAccess(user, employee);
      }
    }

    return this.prisma.requisition.create({
      data: {
        contractId: user.contractId,
        requesterId: user.id,
        lines: {
          create: input.lines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            justification: l.justification,
            type: l.type,
            employeeId: l.employeeId ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  }

  /** BORRADOR → PENDIENTE_INVENTARIO. */
  async submit(user: AuthenticatedUser, id: string) {
    const requisition = await this.prisma.requisition.findUnique({ where: { id } });
    assertContractAccess(user, requisition);
    assertTransition(requisition.status, "PENDIENTE_INVENTARIO");

    return this.prisma.requisition.update({
      where: { id },
      data: { status: "PENDIENTE_INVENTARIO" },
    });
  }

  /**
   * Entrega final: RECIBIDO_EN_BODEGA → ENTREGADO.
   *
   * Es un acto MANUAL de bodega, no un efecto colateral de recibir la
   * compra. Esa separación es la que da la trazabilidad del ADR-005: alguien
   * retira el material en un momento concreto, y eso queda registrado.
   *
   * OJO con el descuento de stock. En `verifyStock` ya se descontó lo que
   * había en bodega; lo comprado entró después con `receive()`. Acá se
   * descuenta ÚNICAMENTE la porción comprada — descontar la cantidad total
   * sería contar la misma salida dos veces y dejar el inventario en falso
   * negativo.
   */
  async deliver(user: AuthenticatedUser, id: string) {
    if (user.role !== "WAREHOUSE" && user.role !== "ADMIN") {
      throw new ForbiddenException("Solo bodega puede registrar la entrega");
    }

    const requisition = await this.prisma.requisition.findUnique({
      where: { id },
      include: { lines: true, purchaseOrders: { include: { lines: true } } },
    });
    assertContractAccess(user, requisition);
    assertTransition(requisition.status, "ENTREGADO");

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { contractId: requisition.contractId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException("El contrato no tiene bodega asignada");
    }

    // Cuánto de cada ítem vino de la compra (lo que hoy está en bodega).
    const compradoPorItem = new Map<string, number>();
    for (const po of requisition.purchaseOrders) {
      for (const l of po.lines) {
        compradoPorItem.set(
          l.itemId,
          (compradoPorItem.get(l.itemId) ?? 0) + l.receivedQty,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const line of requisition.lines) {
        const comprado = compradoPorItem.get(line.itemId) ?? 0;

        if (comprado > 0) {
          // Mismo lock pesimista del ADR-007: la entrega es una salida de
          // stock como cualquier otra.
          const locked = await tx.$queryRaw<{ id: string; quantity: number }[]>`
            SELECT "id", "quantity" FROM "stock"
            WHERE "warehouseId" = ${warehouse.id} AND "itemId" = ${line.itemId}
            FOR UPDATE
          `;
          const row = locked[0];
          if (!row || row.quantity < comprado) {
            throw new BadRequestException(
              `Stock insuficiente para entregar: hay ${row?.quantity ?? 0}, ` +
                `se necesitan ${comprado}`,
            );
          }
          await tx.stock.update({
            where: { id: row.id },
            data: { quantity: { decrement: comprado } },
          });
        }

        // El log registra la cantidad COMPLETA de la línea: es lo que la
        // persona recibe en la mano, sin importar de dónde salió cada parte.
        await tx.deliveryLog.create({
          data: {
            contractId: requisition.contractId,
            itemId: line.itemId,
            employeeId: line.employeeId,
            quantity: line.quantity,
            deliveredById: user.id,
          },
        });
      }

      return tx.requisition.update({
        where: { id },
        data: { status: "ENTREGADO" },
      });
    });
  }

  /**
   * Tareas 5.4/5.5 — verificación de stock con DIVISIÓN DE LÍNEAS.
   *
   * El caso que la gente implementa mal: pido 10 y hay 4. Lo intuitivo es
   * rechazar todo o comprar los 10. Las dos cosas frenan la obra.
   * Lo correcto: despachar los 4 que están y comprar solo los 6 que faltan.
   *
   * Todo dentro de UNA transacción con lock por fila (ADR-007): si dos
   * verificaciones corren a la vez, la segunda ve el stock real.
   */
  async verifyStock(user: AuthenticatedUser, id: string) {
    const requisition = await this.prisma.requisition.findUnique({
      where: { id },
      include: { lines: true },
    });
    assertContractAccess(user, requisition);

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { contractId: requisition.contractId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException("El contrato no tiene bodega asignada");
    }

    return this.prisma.$transaction(async (tx) => {
      const shortfalls: { itemId: string; missing: number }[] = [];
      let linesFullyCovered = 0;

      for (const line of requisition.lines) {
        const locked = await tx.$queryRaw<{ id: string; quantity: number }[]>`
          SELECT "id", "quantity" FROM "stock"
          WHERE "warehouseId" = ${warehouse.id} AND "itemId" = ${line.itemId}
          FOR UPDATE
        `;
        const available = locked[0]?.quantity ?? 0;
        const dispatched = Math.min(available, line.quantity);
        const missing = line.quantity - dispatched;

        if (dispatched > 0 && locked[0]) {
          await tx.stock.update({
            where: { id: locked[0].id },
            data: { quantity: { decrement: dispatched } },
          });
        }

        if (missing > 0) shortfalls.push({ itemId: line.itemId, missing });
        else linesFullyCovered++;
      }

      const status = nextStatusAfterStockCheck({
        linesFullyCovered,
        linesNeedingPurchase: shortfalls.length,
      });
      assertTransition(requisition.status, status);

      let purchaseOrder: { id: string } | null = null;
      if (shortfalls.length > 0) {
        purchaseOrder = await tx.purchaseOrder.create({
          data: {
            contractId: requisition.contractId,
            requisitionId: requisition.id,
            lines: {
              // unitPrice arranca en 0: el precio real lo pone el jefe de
              // compras al aprobar, que es quien negocia con el proveedor.
              create: shortfalls.map((s) => ({
                itemId: s.itemId,
                orderedQty: s.missing,
                unitPrice: 0,
              })),
            },
          },
          select: { id: true },
        });
      }

      await tx.requisition.update({ where: { id }, data: { status } });
      return { status, purchaseOrder };
    });
  }
}
