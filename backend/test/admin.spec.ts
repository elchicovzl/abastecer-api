import { NotFoundException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import { AdminService } from "../src/admin/admin.service";
import type { AuthenticatedUser } from "../src/auth/auth.types";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";

/**
 * Catálogos que consume el frontend (artículos, empleados, contratos).
 *
 * Los empleados son el caso delicado: si un COORDINATOR pudiera listar a
 * TODOS, el desplegable de "empleado receptor" le mostraría gente de las
 * otras 8 obras. La segregación tiene que llegar hasta el catálogo.
 */
describe("catálogos admin", () => {
  let app: INestApplication;
  let service: AdminService;
  let coord1: AuthenticatedUser;
  let admin: AuthenticatedUser;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
    service = app.get(AdminService);

    const load = async (email: string): Promise<AuthenticatedUser> => {
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      return { id: u.id, email: u.email, role: u.role, contractId: u.contractId };
    };
    coord1 = await load("coord1@asofer.com");
    admin = await load("admin@asofer.com");
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("los artículos son globales: 50 para cualquier rol", async () => {
    expect(await service.listItems()).toHaveLength(50);
  });

  it("el COORDINATOR solo ve empleados de SU contrato", async () => {
    const suyos = await service.listEmployees(coord1);

    expect(suyos).toHaveLength(5);
    const contratos = await prisma.employee.findMany({
      where: { id: { in: suyos.map((e) => e.id) } },
      select: { contractId: true },
    });
    expect(new Set(contratos.map((c) => c.contractId))).toEqual(
      new Set([coord1.contractId]),
    );
  });

  it("el ADMIN ve los 45 empleados", async () => {
    expect(await service.listEmployees(admin)).toHaveLength(45);
  });

  it("el COORDINATOR solo ve SU contrato en el listado", async () => {
    const suyos = await service.listContracts(coord1);
    expect(suyos).toHaveLength(1);
    expect(suyos[0]?.id).toBe(coord1.contractId);
  });

  it("el ADMIN ve los 9 contratos", async () => {
    expect(await service.listContracts(admin)).toHaveLength(9);
  });

  it("el listado de usuarios es solo para ADMIN y nunca expone el hash", async () => {
    await expect(service.listUsers(coord1)).rejects.toThrow(NotFoundException);

    const usuarios = await service.listUsers(admin);
    expect(usuarios).toHaveLength(15);
    expect(usuarios.every((u) => !("passwordHash" in u))).toBe(true);
  });
});
