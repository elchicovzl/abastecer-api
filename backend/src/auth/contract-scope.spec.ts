import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  assertContractAccess,
  canAccessContract,
  contractScopeWhere,
} from "./contract-scope";
import type { AuthenticatedUser } from "./auth.types";

/**
 * Tarea 3.6 — el corazón del ADR-002, testeado como funciones PURAS.
 * Cero mocks, cero base de datos, cero request. Entradas y salidas.
 */
const coordinatorA: AuthenticatedUser = {
  id: "u1",
  email: "coord1@asofer.com",
  role: "COORDINATOR",
  contractId: "contract-A",
};
const admin: AuthenticatedUser = {
  id: "u2",
  email: "admin@asofer.com",
  role: "ADMIN",
  contractId: null,
};
const warehouse: AuthenticatedUser = { ...admin, id: "u3", role: "WAREHOUSE" };

describe("contractScopeWhere", () => {
  it("limita al COORDINATOR a su propio contrato", () => {
    expect(contractScopeWhere(coordinatorA)).toEqual({ contractId: "contract-A" });
  });

  it("no filtra nada para ADMIN, WAREHOUSE ni PURCHASING_MANAGER", () => {
    expect(contractScopeWhere(admin)).toEqual({});
    expect(contractScopeWhere(warehouse)).toEqual({});
    expect(contractScopeWhere({ ...admin, role: "PURCHASING_MANAGER" })).toEqual({});
  });

  it("rompe si un COORDINATOR no tiene contrato: dato corrupto, no acceso total", () => {
    // Devolver {} acá le daría acceso a los 9 contratos. Preferimos romper.
    expect(() => contractScopeWhere({ ...coordinatorA, contractId: null })).toThrow(
      NotFoundException,
    );
  });
});

describe("canAccessContract", () => {
  it("el COORDINATOR accede a su contrato y NO a otro", () => {
    expect(canAccessContract(coordinatorA, "contract-A")).toBe(true);
    expect(canAccessContract(coordinatorA, "contract-B")).toBe(false);
  });

  it("los demás roles acceden a cualquier contrato", () => {
    expect(canAccessContract(admin, "contract-B")).toBe(true);
    expect(canAccessContract(warehouse, "contract-Z")).toBe(true);
  });
});

describe("assertContractAccess", () => {
  it("deja pasar el recurso del propio contrato", () => {
    expect(() => assertContractAccess(coordinatorA, { contractId: "contract-A" })).not.toThrow();
  });

  it("ADR-008: recurso de OTRO contrato lanza 404, no 403", () => {
    // El 403 confirmaría que el recurso existe — filtración entre contratos.
    expect(() => assertContractAccess(coordinatorA, { contractId: "contract-B" })).toThrow(
      NotFoundException,
    );
  });

  it("recurso inexistente lanza el MISMO 404 que uno ajeno", () => {
    // Indistinguibles a propósito: si difirieran, el código de estado se
    // convierte en un oráculo de existencia.
    expect(() => assertContractAccess(coordinatorA, null)).toThrow(NotFoundException);
  });
});
