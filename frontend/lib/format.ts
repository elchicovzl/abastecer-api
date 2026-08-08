export const STATUS_LABELS = {
  BORRADOR: "Borrador",
  PENDIENTE_INVENTARIO: "Pendiente de inventario",
  PENDIENTE_APROBACION_JEFE: "Pendiente de aprobación",
  EN_COMPRA: "En compra",
  RECIBIDO_EN_BODEGA: "Recibido en bodega",
  ENTREGADO: "Entregado",
  RECHAZADA: "Rechazada",
} as const;

export type RequisitionStatus = keyof typeof STATUS_LABELS;

export type Tone = "neutral" | "pending" | "success" | "danger";

/** Agrupa los 7 estados en 4 tonos visuales. */
export function statusTone(status: RequisitionStatus): Tone {
  switch (status) {
    case "BORRADOR":
      return "neutral";
    case "ENTREGADO":
      return "success";
    case "RECHAZADA":
      return "danger";
    default:
      return "pending";
  }
}

const CURRENCY = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number): string {
  return CURRENCY.format(amount);
}

/**
 * Una fecha inválida devuelve "—" en vez de "Invalid Date".
 * Una tabla no debe caerse entera porque un registro trae basura.
 */
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
