import { describe, expect, it } from "vitest";

import {
  ItemCategory,
  LineType,
  RequisitionStatus,
  Role,
} from "../src/prisma/generated/client/client";

/**
 * Tarea 2.1 — los enums del dominio viven en Postgres (ADR-004), no como
 * strings sueltos. Estos tests fijan los valores exactos: si alguien agrega,
 * saca o renombra uno, revientan acá y no en producción.
 *
 * Se comparan como Set y no como array ordenado a propósito: el `.sort()`
 * de JS es lexicográfico por code point, donde `_` (95) va DESPUÉS de las
 * mayúsculas, así que "ENTREGADO" ordena antes que "EN_COMPRA". Acoplar el
 * test a esa sutileza no aporta nada y confunde al que lo lea.
 */
describe("enums del dominio", () => {
  it("Role cubre exactamente los 4 roles del RBAC", () => {
    expect(new Set(Object.values(Role))).toEqual(
      new Set(["ADMIN", "COORDINATOR", "WAREHOUSE", "PURCHASING_MANAGER"]),
    );
  });

  it("RequisitionStatus declara los estados en el orden del workflow", () => {
    // Acá el orden SÍ es semántico: es la secuencia del ADR-004.
    // RECHAZADA va al final porque es salida lateral, no un paso.
    expect(Object.values(RequisitionStatus)).toEqual([
      "BORRADOR",
      "PENDIENTE_INVENTARIO",
      "PENDIENTE_APROBACION_JEFE",
      "EN_COMPRA",
      "RECIBIDO_EN_BODEGA",
      "ENTREGADO",
      "RECHAZADA",
    ]);
  });

  it("LineType distingue los 3 tipos de solicitud", () => {
    expect(new Set(Object.values(LineType))).toEqual(
      new Set(["MATERIAL_OBRA", "HERRAMIENTA_EQUIPO", "DOTACION_PERSONAL"]),
    );
  });

  it("ItemCategory cubre las 4 clasificaciones de gasto", () => {
    expect(new Set(Object.values(ItemCategory))).toEqual(
      new Set(["MATERIALES", "EQUIPOS", "DOTACION", "CONSUMIBLES"]),
    );
  });
});
