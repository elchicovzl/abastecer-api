import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma, resetDatabase } from "./db";

/**
 * Tarea 2.2 — entidades núcleo: User, RefreshToken, Contract, Warehouse,
 * Employee. Los tests van contra Postgres real (:5433) porque lo que estamos
 * verificando son CONSTRAINTS DE BASE, y esos no existen fuera de la base.
 */
describe("entidades núcleo", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("un contrato tiene exactamente una bodega", async () => {
    const contract = await prisma.contract.create({
      data: { code: "C-001", name: "Obra Norte" },
    });
    const warehouse = await prisma.warehouse.create({
      data: { name: "Bodega Norte", contractId: contract.id },
    });

    expect(warehouse.contractId).toBe(contract.id);

    // Segunda bodega para el MISMO contrato: la base debe rechazarla.
    // Sin este UNIQUE, "el stock de la bodega del contrato" deja de tener
    // un significado único y todo el ADR-002 se desmorona.
    await expect(
      prisma.warehouse.create({
        data: { name: "Bodega Norte 2", contractId: contract.id },
      }),
    ).rejects.toThrow();
  });

  it("el email de usuario es único", async () => {
    await prisma.user.create({
      data: {
        email: "coord1@asofer.com",
        passwordHash: "hash",
        name: "Coordinador Uno",
        role: "COORDINATOR",
      },
    });

    await expect(
      prisma.user.create({
        data: {
          email: "coord1@asofer.com",
          passwordHash: "otro",
          name: "Impostor",
          role: "ADMIN",
        },
      }),
    ).rejects.toThrow();
  });

  it("solo el COORDINATOR queda atado a un contrato", async () => {
    const contract = await prisma.contract.create({
      data: { code: "C-002", name: "Obra Sur" },
    });

    const coordinator = await prisma.user.create({
      data: {
        email: "coord2@asofer.com",
        passwordHash: "hash",
        name: "Coordinador Dos",
        role: "COORDINATOR",
        contractId: contract.id,
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: "admin@asofer.com",
        passwordHash: "hash",
        name: "Admin",
        role: "ADMIN",
      },
    });

    expect(coordinator.contractId).toBe(contract.id);
    expect(admin.contractId).toBeNull();
  });

  it("el refresh token guarda el HASH y su revocación", async () => {
    const user = await prisma.user.create({
      data: {
        email: "bodega@asofer.com",
        passwordHash: "hash",
        name: "Bodega",
        role: "WAREHOUSE",
      },
    });

    const token = await prisma.refreshToken.create({
      data: {
        tokenHash: "hash-del-refresh",
        userId: user.id,
        expiresAt: new Date("2026-12-31T00:00:00Z"),
      },
    });

    // ADR-001: se guarda el HASH, nunca el token en claro.
    expect(token.tokenHash).toBe("hash-del-refresh");
    expect(token.revokedAt).toBeNull();

    const revoked = await prisma.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date("2026-08-07T00:00:00Z") },
    });
    expect(revoked.revokedAt).not.toBeNull();
  });

  it("el empleado pertenece a un contrato y tiene documento único", async () => {
    const contract = await prisma.contract.create({
      data: { code: "C-003", name: "Obra Este" },
    });

    const employee = await prisma.employee.create({
      data: { documentId: "1093-A", name: "Ana Pérez", contractId: contract.id },
    });
    expect(employee.name).toBe("Ana Pérez");
    expect(employee.contractId).toBe(contract.id);

    await expect(
      prisma.employee.create({
        data: {
          documentId: "1093-A",
          name: "Otro con el mismo documento",
          contractId: contract.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("el código de contrato es único", async () => {
    await prisma.contract.create({ data: { code: "C-004", name: "Obra Oeste" } });
    await expect(
      prisma.contract.create({ data: { code: "C-004", name: "Duplicada" } }),
    ).rejects.toThrow();
  });
});
