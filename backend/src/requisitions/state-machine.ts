import { BadRequestException } from "@nestjs/common";

import type { RequisitionStatus } from "../prisma/generated/client/client";

/**
 * ADR-004 — máquina de estados centralizada.
 *
 * Las transiciones legales se declaran UNA vez, acá. Los services piden
 * permiso; no deciden. Si cada uno definiera por su cuenta a qué estado
 * puede saltar, tarde o temprano dos discrepan y una requisición termina
 * en un estado que nadie previó — y esos son los bugs que nadie reproduce.
 */
export const REQUISITION_TRANSITIONS: Record<RequisitionStatus, RequisitionStatus[]> = {
  BORRADOR: ["PENDIENTE_INVENTARIO"],

  // Dos salidas: si bodega cubrió TODO, se entrega directo sin pasar por
  // compras. Si falta algo, va a la aprobación del jefe.
  PENDIENTE_INVENTARIO: ["PENDIENTE_APROBACION_JEFE", "ENTREGADO"],

  PENDIENTE_APROBACION_JEFE: ["EN_COMPRA", "RECHAZADA"],

  // Ya se le compró al proveedor: rechazar acá dejaría material pago sin
  // destino. Si hay un problema, se resuelve en la recepción.
  EN_COMPRA: ["RECIBIDO_EN_BODEGA"],

  RECIBIDO_EN_BODEGA: ["ENTREGADO"],

  // Terminales.
  ENTREGADO: [],
  RECHAZADA: [],
};

export function canTransition(from: RequisitionStatus, to: RequisitionStatus): boolean {
  return REQUISITION_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RequisitionStatus, to: RequisitionStatus): void {
  if (!canTransition(from, to)) {
    // El mensaje nombra ambos estados: si esto salta en producción, quien
    // lo lea tiene que saber qué se intentó sin abrir el debugger.
    throw new BadRequestException(
      `Transición inválida: ${from} → ${to}. Permitidas desde ${from}: ` +
        `${REQUISITION_TRANSITIONS[from].join(", ") || "ninguna (estado terminal)"}`,
    );
  }
}

/**
 * A dónde va la requisición después de que bodega verificó el stock.
 * Función pura: entra un conteo, sale un estado.
 */
export function nextStatusAfterStockCheck(counts: {
  linesFullyCovered: number;
  linesNeedingPurchase: number;
}): RequisitionStatus {
  return counts.linesNeedingPurchase > 0 ? "PENDIENTE_APROBACION_JEFE" : "ENTREGADO";
}
