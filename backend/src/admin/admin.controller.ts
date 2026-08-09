import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminService } from "./admin.service";

const ROLES = ["ADMIN", "COORDINATOR", "WAREHOUSE", "PURCHASING_MANAGER"] as const;
const CATEGORIES = ["MATERIALES", "EQUIPOS", "DOTACION", "CONSUMIBLES"] as const;

const createEmployeeSchema = z.object({
  documentId: z.string().min(3, { error: "El documento es obligatorio" }),
  name: z.string().min(3, { error: "El nombre es obligatorio" }),
  position: z.string().optional(),
  contractId: z.uuid(),
});

const updateEmployeeSchema = z.object({
  name: z.string().min(3).optional(),
  position: z.string().optional(),
});

const activeSchema = z.object({ active: z.boolean() });

const createItemSchema = z.object({
  sku: z.string().min(3, { error: "El SKU es obligatorio" }),
  name: z.string().min(3, { error: "El nombre es obligatorio" }),
  category: z.enum(CATEGORIES),
  unit: z.string().min(1, { error: "Indicá la unidad de medida" }),
});

const updateItemSchema = z.object({
  name: z.string().min(3).optional(),
  category: z.enum(CATEGORIES).optional(),
  unit: z.string().min(1).optional(),
});

const createUserSchema = z.object({
  email: z.email({ error: "Correo inválido" }),
  name: z.string().min(3, { error: "El nombre es obligatorio" }),
  role: z.enum(ROLES),
  contractId: z.uuid().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(3).optional(),
  role: z.enum(ROLES).optional(),
  contractId: z.uuid().nullable().optional(),
});

const updateContractSchema = z.object({
  name: z.string().min(3, { error: "El nombre es obligatorio" }),
});

/**
 * Los permisos NO se declaran acá con @Roles sino dentro del service.
 *
 * Razón: para empleados la regla no es "qué rol" sino "qué rol Y sobre qué
 * contrato" — un COORDINATOR puede, pero solo en el suyo. Eso es lógica de
 * negocio con scope, y vive en la capa de servicio (ADR-002).
 */
@Controller("admin")
export class AdminController {
  constructor(private readonly service: AdminService) {}

  // ── Lectura ─────────────────────────────────────────────────────────
  @Get("items")
  items() {
    return this.service.listItems();
  }

  @Get("employees")
  employees(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listEmployees(user);
  }

  @Get("contracts")
  contracts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listContracts(user);
  }

  @Get("users")
  users(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listUsers(user);
  }

  // ── Empleados ───────────────────────────────────────────────────────
  @Post("employees")
  createEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEmployeeSchema))
    body: { documentId: string; name: string; position?: string; contractId: string },
  ) {
    return this.service.createEmployee(user, body);
  }

  @Patch("employees/:id")
  updateEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema))
    body: { name?: string; position?: string },
  ) {
    return this.service.updateEmployee(user, id, body);
  }

  @Patch("employees/:id/active")
  setEmployeeActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(activeSchema)) body: { active: boolean },
  ) {
    return this.service.setEmployeeActive(user, id, body.active);
  }

  // ── Artículos ───────────────────────────────────────────────────────
  @Post("items")
  createItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createItemSchema))
    body: { sku: string; name: string; category: (typeof CATEGORIES)[number]; unit: string },
  ) {
    return this.service.createItem(user, body);
  }

  @Patch("items/:id")
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateItemSchema))
    body: { name?: string; category?: (typeof CATEGORIES)[number]; unit?: string },
  ) {
    return this.service.updateItem(user, id, body);
  }

  @Patch("items/:id/active")
  setItemActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(activeSchema)) body: { active: boolean },
  ) {
    return this.service.setItemActive(user, id, body.active);
  }

  // ── Usuarios ────────────────────────────────────────────────────────
  @Post("users")
  createUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createUserSchema))
    body: { email: string; name: string; role: (typeof ROLES)[number]; contractId?: string },
  ) {
    return this.service.createUser(user, body);
  }

  @Patch("users/:id")
  updateUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateUserSchema))
    body: { name?: string; role?: (typeof ROLES)[number]; contractId?: string | null },
  ) {
    return this.service.updateUser(user, id, body);
  }

  @Post("users/:id/reset-password")
  resetPassword(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.resetPassword(user, id);
  }

  @Patch("users/:id/active")
  setUserActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(activeSchema)) body: { active: boolean },
  ) {
    return this.service.setUserActive(user, id, body.active);
  }

  // ── Contratos ───────────────────────────────────────────────────────
  @Patch("contracts/:id")
  updateContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContractSchema)) body: { name: string },
  ) {
    return this.service.updateContract(user, id, body);
  }
}
