import { Injectable, NotFoundException } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { canAccessContract, contractScopeWhere } from "../auth/contract-scope";
import { InventoryService, type StockRow } from "../inventory/inventory.service";
import type { ItemCategory } from "../prisma/generated/client/client";
import { PrismaService } from "../prisma/prisma.service";

export interface SpendRow {
  category: ItemCategory;
  total: number;
}

export interface DeliveryRow {
  itemName: string;
  quantity: number;
  deliveredAt: Date;
  contractId: string;
}

interface ReportFilters {
  contractId?: string;
  from?: Date;
  to?: Date;
}

/**
 * Reportes y dashboard.
 *
 * Un reporte es la vía MÁS fácil de filtrar datos sin darse cuenta: agregás
 * un GROUP BY y de golpe el coordinador de A ve los montos de los otros 8
 * contratos. Por eso TODA consulta acá arranca por `resolveScope()`, sin
 * excepción.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Traduce el filtro pedido + el rol a un `contractId` efectivo.
   * Si un COORDINATOR pide explícitamente otro contrato → 404 (ADR-008),
   * nunca una lista vacía: un array vacío parece "no hay datos" y esconde
   * que en realidad no tenía permiso.
   */
  private resolveScope(user: AuthenticatedUser, filters: ReportFilters): { contractId?: string } {
    if (filters.contractId && !canAccessContract(user, filters.contractId)) {
      throw new NotFoundException("Recurso no encontrado");
    }
    return filters.contractId
      ? { contractId: filters.contractId }
      : contractScopeWhere(user);
  }

  private dateRange(filters: ReportFilters) {
    if (!filters.from && !filters.to) return {};
    return {
      createdAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    };
  }

  /** Gasto por clasificación, solo sobre OC APROBADAS o ya recibidas. */
  async spendByCategory(user: AuthenticatedUser, filters: ReportFilters): Promise<SpendRow[]> {
    const scope = this.resolveScope(user, filters);

    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: {
        purchaseOrder: {
          ...scope,
          ...this.dateRange(filters),
          // Una OC pendiente todavía no es gasto: puede rechazarse.
          status: { in: ["APROBADA", "RECIBIDA_PARCIAL", "RECIBIDA_TOTAL"] },
        },
      },
      select: { orderedQty: true, unitPrice: true, item: { select: { category: true } } },
    });

    const totales = new Map<ItemCategory, number>();
    for (const l of lines) {
      const monto = l.orderedQty * Number(l.unitPrice);
      totales.set(l.item.category, (totales.get(l.item.category) ?? 0) + monto);
    }

    return [...totales.entries()].map(([category, total]) => ({ category, total }));
  }

  /** Dashboard: qué pidió cada contrato y en qué estado está. */
  async requisitionsByContract(user: AuthenticatedUser, filters: ReportFilters) {
    const scope = this.resolveScope(user, filters);

    return this.prisma.requisition.findMany({
      where: { ...scope, ...this.dateRange(filters) },
      select: {
        id: true,
        contractId: true,
        status: true,
        createdAt: true,
        lines: {
          select: {
            quantity: true,
            type: true,
            item: { select: { name: true, sku: true, category: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Tarea 6.3 — trazabilidad de dotación por empleado. */
  async deliveriesByEmployee(
    user: AuthenticatedUser,
    employeeId: string,
  ): Promise<DeliveryRow[]> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { contractId: true },
    });
    // Si el empleado es de otro contrato, 404 — igual que un id inexistente.
    if (!employee || !canAccessContract(user, employee.contractId)) {
      throw new NotFoundException("Recurso no encontrado");
    }

    const logs = await this.prisma.deliveryLog.findMany({
      where: { employeeId },
      select: {
        quantity: true,
        deliveredAt: true,
        contractId: true,
        item: { select: { name: true } },
      },
      orderBy: { deliveredAt: "desc" },
    });

    return logs.map((l) => ({
      itemName: l.item.name,
      quantity: l.quantity,
      deliveredAt: l.deliveredAt,
      contractId: l.contractId,
    }));
  }

  /** Alertas de stock mínimo, ya filtradas por bodega visible. */
  lowStock(user: AuthenticatedUser): Promise<StockRow[]> {
    return this.inventory.lowStockAlerts(user);
  }
}
