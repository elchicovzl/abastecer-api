import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import { AdminService } from "../src/admin/admin.service";
import type { AuthenticatedUser } from "../src/auth/auth.types";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";

/**
 * CRUD de administración.
 *
 * POR QUÉ EXISTE: el desplegable "Empleado receptor" salía vacío en
 * producción. No era un bug del componente — NO HABÍA forma de cargar
 * empleados, ni por UI ni por API. El módulo de dotación quedaba bloqueado
 * entero, porque el ADR-005 exige empleado receptor en cada línea.
 *
 * La tarea 7.9 decía "CRUD" y se había entregado solo la R de listar.
 *
 * Regla de bajas: NUNCA se borra. Un empleado que recibió dotación no se
 * puede eliminar sin destruir su historial de entregas, que es justo lo que
 * el módulo existe para conservar. Se desactiva.
 */
describe("CRUD de administración", () => {
  let app: INestApplication;
  let service: AdminService;
  let admin: AuthenticatedUser;
  let coord1: AuthenticatedUser;
  let coord2: AuthenticatedUser;
  let bodega: AuthenticatedUser;
  let contratoA: string;
  let contratoB: string;

  beforeAll(async () => {
    app = await createTestApp();
    service = app.get(AdminService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seed(prisma);

    const load = async (email: string): Promise<AuthenticatedUser> => {
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      return { id: u.id, email: u.email, role: u.role, contractId: u.contractId };
    };
    admin = await load("admin@asofer.com");
    coord1 = await load("coord1@asofer.com");
    coord2 = await load("coord2@asofer.com");
    bodega = await load("bodega@asofer.com");
    contratoA = coord1.contractId!;
    contratoB = coord2.contractId!;
  });

  // ── Empleados ─────────────────────────────────────────────────────────
  describe("empleados", () => {
    it("el ADMIN carga un empleado en cualquier contrato", async () => {
      const e = await service.createEmployee(admin, {
        documentId: "CC-1090234",
        name: "Ana Pérez",
        position: "Oficial de obra",
        contractId: contratoB,
      });

      expect(e.name).toBe("Ana Pérez");
      expect(e.documentId).toBe("CC-1090234");
    });

    it("el COORDINATOR carga empleados de SU contrato", async () => {
      const e = await service.createEmployee(coord1, {
        documentId: "CC-778812",
        name: "Luis Gómez",
        position: "Soldador",
        contractId: contratoA,
      });
      expect(e.name).toBe("Luis Gómez");
    });

    it("ADR-002: el COORDINATOR NO puede cargar en otro contrato", async () => {
      await expect(
        service.createEmployee(coord1, {
          documentId: "CC-999",
          name: "Ajeno",
          contractId: contratoB,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("bodega NO administra el padrón de empleados", async () => {
      await expect(
        service.createEmployee(bodega, {
          documentId: "CC-111",
          name: "Quien sea",
          contractId: contratoA,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("no se admiten dos empleados con el mismo documento en un contrato", async () => {
      await service.createEmployee(admin, {
        documentId: "CC-555",
        name: "Primero",
        contractId: contratoA,
      });

      await expect(
        service.createEmployee(admin, {
          documentId: "CC-555",
          name: "Duplicado",
          contractId: contratoA,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("la MISMA persona puede estar en dos contratos distintos", async () => {
      // Pasa de verdad: un soldador rota entre obras.
      await service.createEmployee(admin, {
        documentId: "CC-777",
        name: "Rotativo",
        contractId: contratoA,
      });
      const enB = await service.createEmployee(admin, {
        documentId: "CC-777",
        name: "Rotativo",
        contractId: contratoB,
      });
      expect(enB.documentId).toBe("CC-777");
    });

    it("se puede corregir el nombre y el cargo", async () => {
      const e = await service.createEmployee(admin, {
        documentId: "CC-321",
        name: "Nombre Mal Escrito",
        contractId: contratoA,
      });

      const actualizado = await service.updateEmployee(admin, e.id, {
        name: "Nombre Corregido",
        position: "Maestro de obra",
      });
      expect(actualizado.name).toBe("Nombre Corregido");
      expect(actualizado.position).toBe("Maestro de obra");
    });

    it("la baja es LÓGICA: desactivar no borra el historial", async () => {
      const e = await service.createEmployee(admin, {
        documentId: "CC-444",
        name: "Se va de la obra",
        contractId: contratoA,
      });

      const inactivo = await service.setEmployeeActive(admin, e.id, false);
      expect(inactivo.active).toBe(false);

      // Sigue existiendo: su historial de dotación queda intacto.
      const enBase = await prisma.employee.findUnique({ where: { id: e.id } });
      expect(enBase).not.toBeNull();

      // Pero ya no aparece en el selector de nuevas requisiciones.
      const listados = await service.listEmployees(admin);
      expect(listados.some((x) => x.id === e.id)).toBe(false);
    });

    it("el listado del COORDINATOR sigue acotado a su contrato", async () => {
      await service.createEmployee(admin, {
        documentId: "CC-A",
        name: "De A",
        contractId: contratoA,
      });
      await service.createEmployee(admin, {
        documentId: "CC-B",
        name: "De B",
        contractId: contratoB,
      });

      const deCoord1 = await service.listEmployees(coord1);
      expect(deCoord1.some((e) => e.documentId === "CC-A")).toBe(true);
      expect(deCoord1.some((e) => e.documentId === "CC-B")).toBe(false);
    });
  });

  // ── Artículos ─────────────────────────────────────────────────────────
  describe("artículos", () => {
    it("el ADMIN agrega un artículo al catálogo", async () => {
      const item = await service.createItem(admin, {
        sku: "MAT-999",
        name: "Impermeabilizante acrílico",
        category: "MATERIALES",
        unit: "galón",
      });
      expect(item.sku).toBe("MAT-999");
    });

    it("el SKU es único", async () => {
      await expect(
        service.createItem(admin, {
          sku: "MAT-001",
          name: "Duplicado",
          category: "MATERIALES",
          unit: "u",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("el COORDINATOR no toca el catálogo: es global a los 9 contratos", async () => {
      await expect(
        service.createItem(coord1, {
          sku: "MAT-888",
          name: "No debería",
          category: "MATERIALES",
          unit: "u",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("desactivar un artículo lo saca del catálogo sin borrar su historial", async () => {
      const item = await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } });
      await service.setItemActive(admin, item.id, false);

      const catalogo = await service.listItems();
      expect(catalogo.some((i) => i.sku === "MAT-001")).toBe(false);
      expect(await prisma.item.findUnique({ where: { id: item.id } })).not.toBeNull();
    });
  });

  // ── Usuarios ──────────────────────────────────────────────────────────
  describe("usuarios", () => {
    it("el ADMIN crea un usuario y recibe la contraseña UNA vez", async () => {
      const res = await service.createUser(admin, {
        email: "coord13@asofer.com",
        name: "Coordinador Nuevo",
        role: "COORDINATOR",
        contractId: contratoA,
      });

      expect(res.user.email).toBe("coord13@asofer.com");
      expect(res.password).toBeTruthy();
      expect(res.password.length).toBeGreaterThanOrEqual(16);

      // La contraseña se guarda HASHEADA, nunca en claro.
      const enBase = await prisma.user.findUniqueOrThrow({
        where: { email: "coord13@asofer.com" },
      });
      expect(enBase.passwordHash).not.toBe(res.password);
      expect(await bcrypt.compare(res.password, enBase.passwordHash)).toBe(true);
    });

    it("un COORDINATOR sin contrato es un dato corrupto: se rechaza", async () => {
      await expect(
        service.createUser(admin, {
          email: "roto@asofer.com",
          name: "Sin contrato",
          role: "COORDINATOR",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("el email es único", async () => {
      await expect(
        service.createUser(admin, {
          email: "admin@asofer.com",
          name: "Duplicado",
          role: "ADMIN",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("solo el ADMIN administra usuarios", async () => {
      await expect(
        service.createUser(coord1, {
          email: "intruso@asofer.com",
          name: "Intruso",
          role: "ADMIN",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("el reseteo genera una contraseña nueva que SÍ funciona", async () => {
      const objetivo = await prisma.user.findUniqueOrThrow({
        where: { email: "bodega@asofer.com" },
      });
      const anterior = objetivo.passwordHash;

      const { password } = await service.resetPassword(admin, objetivo.id);

      const despues = await prisma.user.findUniqueOrThrow({ where: { id: objetivo.id } });
      expect(despues.passwordHash).not.toBe(anterior);
      expect(await bcrypt.compare(password, despues.passwordHash)).toBe(true);
    });

    it("el reseteo REVOCA las sesiones abiertas", async () => {
      const objetivo = await prisma.user.findUniqueOrThrow({
        where: { email: "bodega@asofer.com" },
      });
      await prisma.refreshToken.create({
        data: {
          tokenHash: "sesion-abierta",
          userId: objetivo.id,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });

      await service.resetPassword(admin, objetivo.id);

      // Si te resetean la contraseña, las sesiones viejas tienen que morir:
      // el caso típico es una cuenta comprometida.
      const vivos = await prisma.refreshToken.findMany({
        where: { userId: objetivo.id, revokedAt: null },
      });
      expect(vivos).toHaveLength(0);
    });

    it("desactivar un usuario le impide entrar, sin borrar su rastro", async () => {
      const objetivo = await prisma.user.findUniqueOrThrow({
        where: { email: "coord3@asofer.com" },
      });

      const inactivo = await service.setUserActive(admin, objetivo.id, false);
      expect(inactivo.active).toBe(false);
      expect(await prisma.user.findUnique({ where: { id: objetivo.id } })).not.toBeNull();
    });

    it("el ADMIN no puede desactivarse a sí mismo y quedar afuera", async () => {
      await expect(service.setUserActive(admin, admin.id, false)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── Contratos ─────────────────────────────────────────────────────────
  describe("contratos", () => {
    it("el ADMIN corrige el nombre de un contrato", async () => {
      const c = await prisma.contract.findFirstOrThrow({ where: { code: "C-001" } });
      const actualizado = await service.updateContract(admin, c.id, {
        name: "Reforzamiento Torre Norte — Fase II",
      });
      expect(actualizado.name).toBe("Reforzamiento Torre Norte — Fase II");
    });

    it("el COORDINATOR no edita contratos", async () => {
      const c = await prisma.contract.findFirstOrThrow({ where: { code: "C-001" } });
      await expect(
        service.updateContract(coord1, c.id, { name: "No debería" }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
