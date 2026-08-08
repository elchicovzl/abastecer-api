import { describe, expect, it } from "vitest";

import { canAccessRoute, homeRouteFor, ROUTE_ROLES } from "./permissions";

/**
 * Tarea 7.2 — gating de rutas por rol.
 *
 * Es lógica PURA a propósito: el middleware solo la invoca. Así se testea
 * sin montar un request de Next, y la misma tabla sirve para decidir qué
 * links mostrar en el menú — una sola fuente de verdad.
 *
 * OJO: esto es UX, no seguridad. La seguridad real vive en los guards del
 * backend. Si alguien saltea el middleware, igual come 403.
 */
describe("canAccessRoute", () => {
  it("el COORDINATOR entra a requisiciones y al dashboard", () => {
    expect(canAccessRoute("COORDINATOR", "/requisitions")).toBe(true);
    expect(canAccessRoute("COORDINATOR", "/requisitions/new")).toBe(true);
    expect(canAccessRoute("COORDINATOR", "/dashboard")).toBe(true);
  });

  it("el COORDINATOR NO entra a bodega, compras ni admin", () => {
    expect(canAccessRoute("COORDINATOR", "/warehouse")).toBe(false);
    expect(canAccessRoute("COORDINATOR", "/purchase-orders")).toBe(false);
    expect(canAccessRoute("COORDINATOR", "/admin")).toBe(false);
  });

  it("bodega entra a su pantalla pero no a la de aprobación de compras", () => {
    expect(canAccessRoute("WAREHOUSE", "/warehouse")).toBe(true);
    expect(canAccessRoute("WAREHOUSE", "/purchase-orders")).toBe(false);
  });

  it("el jefe de compras aprueba pero no despacha", () => {
    expect(canAccessRoute("PURCHASING_MANAGER", "/purchase-orders")).toBe(true);
    expect(canAccessRoute("PURCHASING_MANAGER", "/warehouse")).toBe(false);
  });

  it("el ADMIN entra a todas las rutas declaradas", () => {
    for (const route of Object.keys(ROUTE_ROLES)) {
      expect(canAccessRoute("ADMIN", route)).toBe(true);
    }
  });

  it("las subrutas heredan el permiso del prefijo", () => {
    expect(canAccessRoute("WAREHOUSE", "/warehouse/receive/abc-123")).toBe(
      true,
    );
    expect(canAccessRoute("COORDINATOR", "/admin/users/nuevo")).toBe(false);
  });

  it("una ruta NO declarada queda cerrada por defecto", () => {
    // Default cerrado: una pantalla nueva no nace accesible por olvido.
    expect(canAccessRoute("COORDINATOR", "/reportes-secretos")).toBe(false);
  });
});

describe("homeRouteFor", () => {
  it("cada rol aterriza donde tiene trabajo", () => {
    expect(homeRouteFor("COORDINATOR")).toBe("/requisitions");
    expect(homeRouteFor("WAREHOUSE")).toBe("/warehouse");
    expect(homeRouteFor("PURCHASING_MANAGER")).toBe("/purchase-orders");
    expect(homeRouteFor("ADMIN")).toBe("/dashboard");
  });
});
