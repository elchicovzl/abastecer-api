import { describe, expect, it } from "vitest";

import {
  assertTransition,
  canTransition,
  nextStatusAfterStockCheck,
  REQUISITION_TRANSITIONS,
} from "./state-machine";

/**
 * Tarea 5.1 — ADR-004. Máquina de estados centralizada.
 *
 * Funciones puras: sin base, sin request, sin mocks. Las transiciones
 * legales se declaran en UN solo lugar. Si cada service decidiera por su
 * cuenta a qué estado puede saltar, tarde o temprano dos discrepan y una
 * requisición queda en un estado que nadie previó.
 */
describe("transiciones de requisición", () => {
  it("el camino feliz completo es legal, paso a paso", () => {
    const camino = [
      "BORRADOR",
      "PENDIENTE_INVENTARIO",
      "PENDIENTE_APROBACION_JEFE",
      "EN_COMPRA",
      "RECIBIDO_EN_BODEGA",
      "ENTREGADO",
    ] as const;

    for (let i = 0; i < camino.length - 1; i++) {
      expect(canTransition(camino[i]!, camino[i + 1]!)).toBe(true);
    }
  });

  it("se puede entregar directo si había stock: sin pasar por compra", () => {
    // Este es el atajo del ADR-003 cuando la bodega cubre todo lo pedido.
    expect(canTransition("PENDIENTE_INVENTARIO", "ENTREGADO")).toBe(true);
  });

  it("NO se puede saltar de BORRADOR directo a ENTREGADO", () => {
    // Saltear la verificación de stock significaría entregar material
    // que nadie confirmó que existe.
    expect(canTransition("BORRADOR", "ENTREGADO")).toBe(false);
  });

  it("NO se puede volver atrás desde ENTREGADO", () => {
    expect(canTransition("ENTREGADO", "BORRADOR")).toBe(false);
    expect(canTransition("ENTREGADO", "EN_COMPRA")).toBe(false);
  });

  it("ENTREGADO y RECHAZADA son estados terminales", () => {
    expect(REQUISITION_TRANSITIONS.ENTREGADO).toEqual([]);
    expect(REQUISITION_TRANSITIONS.RECHAZADA).toEqual([]);
  });

  it("se puede rechazar desde la aprobación del jefe, pero no después de comprar", () => {
    expect(canTransition("PENDIENTE_APROBACION_JEFE", "RECHAZADA")).toBe(true);
    expect(canTransition("EN_COMPRA", "RECHAZADA")).toBe(false);
  });

  it("assertTransition lanza con un mensaje que dice QUÉ se intentó", () => {
    expect(() => assertTransition("BORRADOR", "ENTREGADO")).toThrow(
      /BORRADOR.*ENTREGADO/,
    );
    expect(() => assertTransition("BORRADOR", "PENDIENTE_INVENTARIO")).not.toThrow();
  });
});

describe("nextStatusAfterStockCheck", () => {
  it("si TODO se cubrió con stock, la requisición queda ENTREGADO", () => {
    expect(nextStatusAfterStockCheck({ linesFullyCovered: 3, linesNeedingPurchase: 0 })).toBe(
      "ENTREGADO",
    );
  });

  it("si algo falta, pasa a esperar la aprobación del jefe", () => {
    expect(nextStatusAfterStockCheck({ linesFullyCovered: 2, linesNeedingPurchase: 1 })).toBe(
      "PENDIENTE_APROBACION_JEFE",
    );
  });

  it("cobertura parcial: alcanza con UNA línea sin cubrir para ir a compras", () => {
    expect(nextStatusAfterStockCheck({ linesFullyCovered: 0, linesNeedingPurchase: 1 })).toBe(
      "PENDIENTE_APROBACION_JEFE",
    );
  });
});
