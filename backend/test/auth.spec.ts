import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seed } from "../prisma/seed";
import { createTestApp } from "./app";
import { prisma, resetDatabase } from "./db";
import { body, http, type LoginBody, type RefreshBody } from "./http";

/**
 * Tareas 3.1 y 3.2 — autenticación (ADR-001).
 *
 * Lo que se verifica no es "el login anda", sino que el refresh token se
 * pueda REVOCAR de verdad. Un JWT sin estado solo se puede esperar a que
 * expire: si se filtra, el atacante tiene 7 días de acceso y no hay botón
 * para cortarlo. Por eso el hash va a la base.
 */
describe("auth", () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetDatabase();
    await seed(prisma);
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const login = (email: string, password = "changeme123") =>
    http(app).post("/api/auth/login").send({ email, password });

  it("devuelve access y refresh con credenciales válidas", async () => {
    const res = await login("admin@asofer.com");

    const b = body<LoginBody>(res);
    expect(res.status).toBe(200);
    expect(typeof b.accessToken).toBe("string");
    expect(typeof b.refreshToken).toBe("string");
    expect(b.user.email).toBe("admin@asofer.com");
    expect(b.user.role).toBe("ADMIN");
    // Nunca debe viajar el hash de la contraseña al cliente.
    expect(b.user).not.toHaveProperty("passwordHash");
  });

  it("rechaza contraseña incorrecta con 401", async () => {
    const res = await login("admin@asofer.com", "incorrecta");
    expect(res.status).toBe(401);
  });

  it("rechaza email inexistente con 401, sin revelar que no existe", async () => {
    const res = await login("nadie@asofer.com");
    expect(res.status).toBe(401);
  });

  it("el refresh token se guarda HASHEADO, nunca en claro", async () => {
    const res = await login("bodega@asofer.com");
    const raw = body<LoginBody>(res).refreshToken;

    const guardados = await prisma.refreshToken.findMany();
    expect(guardados.length).toBeGreaterThan(0);
    expect(guardados.every((t) => t.tokenHash !== raw)).toBe(true);
  });

  it("el refresh entrega un access token nuevo", async () => {
    const res = await login("compras@asofer.com");
    const refreshed = await http(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: body<LoginBody>(res).refreshToken });

    expect(refreshed.status).toBe(200);
    expect(typeof body<RefreshBody>(refreshed).accessToken).toBe("string");
  });

  it("ADR-001: tras el logout, el refresh devuelve 401", async () => {
    const res = await login("coord1@asofer.com");
    const { refreshToken, accessToken } = body<LoginBody>(res);

    const out = await http(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(out.status).toBe(204);

    // ESTE es el test que justifica guardar el hash en la base.
    const reuse = await http(app).post("/api/auth/refresh").send({ refreshToken });
    expect(reuse.status).toBe(401);
  });

  it("un refresh token inventado devuelve 401", async () => {
    const res = await http(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "esto-no-es-un-token" });
    expect(res.status).toBe(401);
  });

  it("/api/auth/me exige access token y devuelve el usuario", async () => {
    const sinToken = await http(app).get("/api/auth/me");
    expect(sinToken.status).toBe(401);

    const res = await login("coord2@asofer.com");
    const conToken = await http(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${body<LoginBody>(res).accessToken}`);

    const me = body<LoginBody["user"]>(conToken);
    expect(conToken.status).toBe(200);
    expect(me.email).toBe("coord2@asofer.com");
    expect(me.contractId).not.toBeNull();
  });
});
