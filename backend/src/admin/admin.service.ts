import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

import type { AuthenticatedUser } from "../auth/auth.types";
import { canAccessContract, contractScopeWhere } from "../auth/contract-scope";
import type { ItemCategory, Role } from "../prisma/generated/client/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Catálogos y administración.
 *
 * Dos reglas atraviesan todo este servicio:
 *
 * 1. **La segregación llega hasta el CATÁLOGO.** Si un COORDINATOR pudiera
 *    listar todos los empleados, el selector de "empleado receptor" le
 *    mostraría gente de las otras 8 obras.
 *
 * 2. **NUNCA se borra, se DESACTIVA.** Un empleado que recibió dotación o un
 *    artículo que aparece en una requisición no se pueden eliminar sin
 *    destruir el historial — que es justo lo que el sistema existe para
 *    conservar. Por eso el schema tiene `active`.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Lectura ───────────────────────────────────────────────────────────

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
      select: {
        id: true,
        documentId: true,
        name: true,
        position: true,
        contractId: true,
      },
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
    this.assertAdmin(user);

    // `select` explícito: nunca devolver passwordHash, ni por descuido en un
    // `include` futuro.
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

  // ── Empleados ─────────────────────────────────────────────────────────

  /**
   * ADMIN en cualquier contrato; COORDINATOR solo en el suyo.
   *
   * El coordinador conoce a su gente y es quien la va a necesitar en las
   * requisiciones: obligarlo a pedirle al admin que cargue cada ingreso
   * convierte al admin en cuello de botella de 9 obras con rotación.
   */
  async createEmployee(
    user: AuthenticatedUser,
    input: { documentId: string; name: string; position?: string; contractId: string },
  ) {
    this.assertPuedeAdministrarEmpleados(user);
    if (!canAccessContract(user, input.contractId)) {
      throw new NotFoundException("Recurso no encontrado");
    }

    const duplicado = await this.prisma.employee.findUnique({
      where: {
        contractId_documentId: {
          contractId: input.contractId,
          documentId: input.documentId,
        },
      },
    });
    if (duplicado) {
      throw new BadRequestException(
        `Ya existe un empleado con el documento ${input.documentId} en este contrato`,
      );
    }

    return this.prisma.employee.create({
      data: {
        documentId: input.documentId.trim(),
        name: input.name.trim(),
        position: input.position?.trim() || null,
        contractId: input.contractId,
      },
      select: {
        id: true,
        documentId: true,
        name: true,
        position: true,
        contractId: true,
        active: true,
      },
    });
  }

  async updateEmployee(
    user: AuthenticatedUser,
    id: string,
    input: { name?: string; position?: string },
  ) {
    this.assertPuedeAdministrarEmpleados(user);
    await this.assertEmpleadoVisible(user, id);

    return this.prisma.employee.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.position !== undefined
          ? { position: input.position.trim() || null }
          : {}),
      },
      select: {
        id: true,
        documentId: true,
        name: true,
        position: true,
        contractId: true,
        active: true,
      },
    });
  }

  /** Baja LÓGICA: el historial de dotación del empleado queda intacto. */
  async setEmployeeActive(user: AuthenticatedUser, id: string, active: boolean) {
    this.assertPuedeAdministrarEmpleados(user);
    await this.assertEmpleadoVisible(user, id);

    return this.prisma.employee.update({
      where: { id },
      data: { active },
      select: { id: true, documentId: true, name: true, active: true },
    });
  }

  // ── Artículos ─────────────────────────────────────────────────────────

  /** El catálogo es global a los 9 contratos: solo el ADMIN lo toca. */
  async createItem(
    user: AuthenticatedUser,
    input: { sku: string; name: string; category: ItemCategory; unit: string },
  ) {
    if (user.role !== "ADMIN") {
      throw new ForbiddenException("Solo el administrador gestiona el catálogo");
    }

    const duplicado = await this.prisma.item.findUnique({
      where: { sku: input.sku },
    });
    if (duplicado) {
      throw new BadRequestException(`Ya existe un artículo con el SKU ${input.sku}`);
    }

    return this.prisma.item.create({
      data: {
        sku: input.sku.trim().toUpperCase(),
        name: input.name.trim(),
        category: input.category,
        unit: input.unit.trim(),
      },
      select: { id: true, sku: true, name: true, category: true, unit: true },
    });
  }

  async updateItem(
    user: AuthenticatedUser,
    id: string,
    input: { name?: string; category?: ItemCategory; unit?: string },
  ) {
    if (user.role !== "ADMIN") {
      throw new ForbiddenException("Solo el administrador gestiona el catálogo");
    }
    return this.prisma.item.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.unit !== undefined ? { unit: input.unit.trim() } : {}),
      },
      select: { id: true, sku: true, name: true, category: true, unit: true },
    });
  }

  async setItemActive(user: AuthenticatedUser, id: string, active: boolean) {
    if (user.role !== "ADMIN") {
      throw new ForbiddenException("Solo el administrador gestiona el catálogo");
    }
    return this.prisma.item.update({
      where: { id },
      data: { active },
      select: { id: true, sku: true, name: true, active: true },
    });
  }

  // ── Usuarios ──────────────────────────────────────────────────────────

  /**
   * Crea el usuario con una contraseña ALEATORIA que se devuelve UNA vez.
   * Nunca se define desde el formulario: una contraseña elegida por quien
   * crea la cuenta es una contraseña que esa persona conoce.
   */
  async createUser(
    user: AuthenticatedUser,
    input: { email: string; name: string; role: Role; contractId?: string },
  ): Promise<{ user: { id: string; email: string; role: Role }; password: string }> {
    this.assertAdmin(user);

    if (input.role === "COORDINATOR" && !input.contractId) {
      // Un COORDINATOR sin contrato rompe toda la segregación: no habría
      // con qué filtrar. Se corta acá.
      throw new BadRequestException("Un coordinador debe pertenecer a un contrato");
    }

    const duplicado = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (duplicado) {
      throw new BadRequestException(`Ya existe un usuario con el correo ${input.email}`);
    }

    const password = randomBytes(16).toString("base64url");
    const creado = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase().trim(),
        name: input.name.trim(),
        role: input.role,
        passwordHash: await bcrypt.hash(password, 12),
        contractId: input.role === "COORDINATOR" ? (input.contractId ?? null) : null,
      },
      select: { id: true, email: true, role: true },
    });

    return { user: creado, password };
  }

  async updateUser(
    user: AuthenticatedUser,
    id: string,
    input: { name?: string; role?: Role; contractId?: string | null },
  ) {
    this.assertAdmin(user);

    if (input.role === "COORDINATOR" && !input.contractId) {
      throw new BadRequestException("Un coordinador debe pertenecer a un contrato");
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.contractId !== undefined ? { contractId: input.contractId } : {}),
      },
      select: { id: true, email: true, name: true, role: true, contractId: true, active: true },
    });
  }

  /**
   * Genera una contraseña nueva y REVOCA todas las sesiones abiertas.
   *
   * Lo segundo importa tanto como lo primero: el caso típico de un reseteo
   * es una cuenta comprometida, y dejar vivos los refresh tokens le daría
   * al atacante 7 días más de acceso.
   */
  async resetPassword(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ email: string; password: string }> {
    this.assertAdmin(user);

    const password = randomBytes(16).toString("base64url");
    const actualizado = await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12) },
      select: { email: true },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { email: actualizado.email, password };
  }

  async setUserActive(user: AuthenticatedUser, id: string, active: boolean) {
    this.assertAdmin(user);

    if (id === user.id && !active) {
      // Sin esta guarda, el único admin puede dejarse afuera del sistema y
      // no queda nadie para reactivarlo.
      throw new BadRequestException("No podés desactivar tu propia cuenta");
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return this.prisma.user.update({
      where: { id },
      data: { active },
      select: { id: true, email: true, name: true, active: true },
    });
  }

  // ── Contratos ─────────────────────────────────────────────────────────

  async updateContract(user: AuthenticatedUser, id: string, input: { name: string }) {
    this.assertAdmin(user);
    return this.prisma.contract.update({
      where: { id },
      data: { name: input.name.trim() },
      select: { id: true, code: true, name: true },
    });
  }

  // ── Guardas ───────────────────────────────────────────────────────────

  /** 404 y no 403: un 403 confirma que el recurso existe. */
  private assertAdmin(user: AuthenticatedUser): void {
    if (user.role !== "ADMIN") throw new NotFoundException("Recurso no encontrado");
  }

  private assertPuedeAdministrarEmpleados(user: AuthenticatedUser): void {
    if (user.role !== "ADMIN" && user.role !== "COORDINATOR") {
      throw new ForbiddenException("Tu rol no administra el padrón de empleados");
    }
  }

  private async assertEmpleadoVisible(
    user: AuthenticatedUser,
    id: string,
  ): Promise<void> {
    const empleado = await this.prisma.employee.findUnique({
      where: { id },
      select: { contractId: true },
    });
    if (!empleado || !canAccessContract(user, empleado.contractId)) {
      throw new NotFoundException("Recurso no encontrado");
    }
  }
}
