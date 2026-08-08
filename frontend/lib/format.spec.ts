import { describe, expect, it } from "vitest";

import {
  formatCurrency,
  formatDate,
  STATUS_LABELS,
  statusTone,
} from "./format";

/**
 * Tarea 7.5 — presentación de estados y montos.
 * Puro: entra un dato, sale un string. Cero DOM, cero mocks.
 */
describe("STATUS_LABELS", () => {
  it("cubre los 7 estados del workflow, sin dejar ninguno sin traducir", () => {
    // Si mañana se agrega un estado al backend y nadie toca esto, la UI
    // mostraría el enum crudo. Este test lo impide.
    expect(Object.keys(STATUS_LABELS)).toHaveLength(7);
    expect(STATUS_LABELS.PENDIENTE_APROBACION_JEFE).toBe(
      "Pendiente de aprobación",
    );
    expect(STATUS_LABELS.RECIBIDO_EN_BODEGA).toBe("Recibido en bodega");
  });
});

describe("statusTone", () => {
  it("distingue en curso, terminado y rechazado", () => {
    expect(statusTone("BORRADOR")).toBe("neutral");
    expect(statusTone("PENDIENTE_INVENTARIO")).toBe("pending");
    expect(statusTone("ENTREGADO")).toBe("success");
    expect(statusTone("RECHAZADA")).toBe("danger");
  });
});

describe("formatCurrency", () => {
  it("formatea montos en pesos colombianos sin decimales", () => {
    expect(formatCurrency(1500)).toContain("1.500");
    expect(formatCurrency(0)).toContain("0");
  });

  it("no revienta con montos grandes", () => {
    expect(formatCurrency(12_345_678)).toContain("12.345.678");
  });
});

describe("formatDate", () => {
  it("muestra la fecha en formato local corto", () => {
    expect(formatDate("2026-08-07T15:30:00.000Z")).toMatch(
      /\d{2}\/\d{2}\/\d{4}/,
    );
  });

  it("tolera una fecha inválida sin romper la pantalla", () => {
    // Una tabla no debe caerse entera porque un registro trae basura.
    expect(formatDate("no-es-fecha")).toBe("—");
  });
});
