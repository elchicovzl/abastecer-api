import { Injectable, NotFoundException } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { contractScopeWhere } from "../auth/contract-scope";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Catálogos que alimentan los desplegables del frontend.
 *
 * Los empleados son el caso delicado: si un COORDINATOR pudiera listarlos
 * todos, el selector de "empleado receptor" le mostraría gente de las otras
 * 8 obras. La segregación tiene que llegar hasta el CATÁLOGO, no solo hasta
 * las transacciones.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Los artículos son globales: el catálogo es el mismo para toda ASOFER. */
  listItems() {
    return this.prisma.item.findMany({
      where: { active: true },
      select: { id: true, sku: true, name: true, category: true, unit: true },
      orderBy: { sku: "asc" },
    });
  }

  listEmployees(user: AuthenticatedUser) {
    return this.prisma.employee.findMany({
      where: { ...contractScopeWhere(user), active: true },
      select: { id: true, documentId: true, name: true, position: true },
      orderBy: { name: "asc" },
    });
  }

  listContracts(user: AuthenticatedUser) {
    const scope = contractScopeWhere(user);
    return this.prisma.contract.findMany({
      where: scope.contractId ? { id: scope.contractId } : {},
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });
  }

  /** Solo ADMIN. 404 y no 403: no confirmamos que el recurso exista. */
  async listUsers(user: AuthenticatedUser) {
    if (user.role !== "ADMIN") throw new NotFoundException("Recurso no encontrado");

    // `select` explícito: nunca devolver passwordHash, ni por descuido en
    // un `include` futuro.
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        contractId: true,
      },
      orderBy: { email: "asc" },
    });
  }
}
