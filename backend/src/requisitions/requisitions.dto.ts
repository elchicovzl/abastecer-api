import { z } from "zod";

/**
 * DTOs con Zod, compartibles con el frontend: una sola definición de la forma
 * de los datos, validada en los dos lados. Dos librerías de validación serían
 * dos fuentes de verdad que se desincronizan.
 */
export const requisitionLineSchema = z.object({
  itemId: z.uuid({ error: "itemId debe ser un UUID" }),
  quantity: z.number().int().positive({ error: "La cantidad debe ser mayor a cero" }),
  justification: z.string().min(3, { error: "La justificación es obligatoria" }),
  type: z.enum(["MATERIAL_OBRA", "HERRAMIENTA_EQUIPO", "DOTACION_PERSONAL"]),
  employeeId: z.uuid().optional(),
});

export const createRequisitionSchema = z.object({
  lines: z.array(requisitionLineSchema).min(1, {
    error: "La requisición debe tener al menos una línea",
  }),
});

export const approveOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        unitPrice: z.number().nonnegative(),
        orderedQty: z.number().int().positive().optional(),
      }),
    )
    .optional(),
});

export const rejectOrderSchema = z.object({
  reason: z.string().min(5, { error: "El rechazo debe indicar un motivo" }),
});

export const receiveOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        receivedQty: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export type CreateRequisitionInput = z.infer<typeof createRequisitionSchema>;
export type ApproveOrderInput = z.infer<typeof approveOrderSchema>;
export type ReceiveOrderInput = z.infer<typeof receiveOrderSchema>;
