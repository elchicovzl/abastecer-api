import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";
import { body, http, type LoginBody } from "./http";

/**
 * Tareas 3.3–3.7 — RBAC y segregación por contrato, por HTTP real.
 *
 * Los tests de `contract-scope.spec.ts` prueban la lógica pura. Estos prueban
 * que además esté CABLEADA: que los guards globales corran de verdad. Una
 * función perfecta que nadie invoca no protege nada.
 */
describe("RBAC y segregación por contrato", () => {
  let app: INestApplication;
  let tokens: Record<string, string>;
  let reqA: string;
  let reqB: string;

  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();

    const emails = {
      admin: "admin@asofer.com",
      coord1: "coord1@asofer.com",
      coord2: "coord2@asofer.com",
      bodega: "bodega@asofer.com",
      compras: "compras@asofer.com",
    };
    tokens = {};
    for (const [key, email] of Object.entries(emails)) {
      const res = await http(app)
        .post("/api/auth/login")
        .send({ email, password: "changeme123" });
      tokens[key] = body<LoginBody>(res).accessToken;
    }

    // Una requisición en el contrato de coord1 y otra en el de coord2.
    const c1 = await prisma.user.findUniqueOrThrow({ where: { email: emails.coord1 } });
    const c2 = await prisma.user.findUniqueOrThrow({ where: { email: emails.coord2 } });
    if (!c1.contractId || !c2.contractId) throw new Error("los coordinadores deben tener contrato");

    reqA = (
      await prisma.requisition.create({
        data: {
          contractId: c1.contractId,
          requesterId: c1.id,
          status: "PENDIENTE_INVENTARIO",
        },
      })
    ).id;
    reqB = (
      await prisma.requisition.create({
        data: { contractId: c2.contractId, requesterId: c2.id },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Crea una OC PENDIENTE nueva. Cada test que muta necesita la suya:
   *  aprobar cambia el estado y la siguiente aprobación fallaría por
   *  estado, no por permisos — y ahí el test dejaría de probar RBAC. */
  async function freshPurchaseOrder(): Promise<string> {
    const c1 = await prisma.user.findUniqueOrThrow({
      where: { email: "coord1@asofer.com" },
    });
    const item = await prisma.item.findFirstOrThrow({ where: { sku: "MAT-001" } });
    const req = await prisma.requisition.create({
      data: { contractId: c1.contractId!, requesterId: c1.id, status: "PENDIENTE_APROBACION_JEFE" },
    });
    const po = await prisma.purchaseOrder.create({
      data: {
        contractId: c1.contractId!,
        requisitionId: req.id,
        lines: { create: [{ itemId: item.id, orderedQty: 5, unitPrice: 10 }] },
      },
    });
    return po.id;
  }

  it("sin token, todo endpoint responde 401 (default cerrado)", async () => {
    const res = await http(app).get("/api/requisitions");
    expect(res.status).toBe(401);
  });

  it("3.3: un COORDINATOR aprobando una OC recibe 403", async () => {
    const poId = await freshPurchaseOrder();
    const res = await http(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set(as("coord1"))
      .send({});
    expect(res.status).toBe(403);
  });

  it("el PURCHASING_MANAGER sí puede aprobar", async () => {
    const poId = await freshPurchaseOrder();
    const res = await http(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set(as("compras"))
      .send({});
    expect(res.status).toBe(201);
    expect(body<{ status: string }>(res).status).toBe("APROBADA");
  });

  it("un endpoint con varios roles acepta a todos ellos y rechaza al resto", async () => {
    // verify-stock admite WAREHOUSE y ADMIN, no PURCHASING_MANAGER.
    const rechazado = await http(app)
      .post(`/api/requisitions/${reqA}/verify-stock`)
      .set(as("compras"));
    expect(rechazado.status).toBe(403);

    // bodega SÍ pasa el guard (el 201 confirma que la acción se ejecutó).
    const aceptado = await http(app)
      .post(`/api/requisitions/${reqA}/verify-stock`)
      .set(as("bodega"));
    expect(aceptado.status).toBe(201);
  });

  it("ADR-002: el COORDINATOR solo lista requisiciones de SU contrato", async () => {
    const res = await http(app)
      .get("/api/requisitions")
      .set(as("coord1"));

    expect(res.status).toBe(200);
    expect(body<{ id: string }[]>(res).length).toBeGreaterThan(0);
    const ids = body<{ id: string }[]>(res).map((r) => r.id);
    expect(ids).toContain(reqA);
    expect(ids).not.toContain(reqB);
  });

  it("el ADMIN ve las requisiciones de TODOS los contratos", async () => {
    const res = await http(app)
      .get("/api/requisitions")
      .set(as("admin"));

    const ids = body<{ id: string }[]>(res).map((r) => r.id);
    expect(ids).toContain(reqA);
    expect(ids).toContain(reqB);
  });

  it("3.5 / ADR-008: pedir por id una requisición de OTRO contrato da 404, no 403", async () => {
    const propia = await http(app)
      .get(`/api/requisitions/${reqA}`)
      .set(as("coord1"));
    expect(propia.status).toBe(200);

    const ajena = await http(app)
      .get(`/api/requisitions/${reqB}`)
      .set(as("coord1"));
    // 404 y NO 403: un 403 confirmaría que reqB existe.
    expect(ajena.status).toBe(404);
  });

  it("un id inexistente devuelve el MISMO 404 que uno ajeno", async () => {
    const inexistente = await http(app)
      .get("/api/requisitions/00000000-0000-0000-0000-000000000000")
      .set(as("coord1"));
    expect(inexistente.status).toBe(404);
  });

  it("3.7: toda mutación queda auditada con su usuario", async () => {
    const antes = await prisma.auditLog.count();

    const poId = await freshPurchaseOrder();
    await http(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set(as("compras"))
      .send({});
    await new Promise((r) => setTimeout(r, 200)); // la auditoría no bloquea la respuesta

    const despues = await prisma.auditLog.count();
    expect(despues).toBeGreaterThan(antes);

    const ultimo = await prisma.auditLog.findFirstOrThrow({ orderBy: { at: "desc" } });
    const compras = await prisma.user.findUniqueOrThrow({
      where: { email: "compras@asofer.com" },
    });
    expect(ultimo.userId).toBe(compras.id);
    expect(ultimo.action).toContain("POST");
  });

  it("3.7: la auditoría NUNCA guarda tokens ni contraseñas", async () => {
    await http(app)
      .post("/api/auth/login")
      .send({ email: "admin@asofer.com", password: "changeme123" });
    await new Promise((r) => setTimeout(r, 150));

    const logs = await prisma.auditLog.findMany();
    const serializado = JSON.stringify(logs);

    expect(serializado).not.toContain("changeme123");
    expect(serializado).not.toContain("accessToken");
    expect(serializado).not.toContain("refreshToken");
  });
});
