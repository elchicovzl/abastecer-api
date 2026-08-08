import { z } from "zod";

/**
 * Schemas espejo de los DTOs del backend (`backend/src/requisitions/
 * requisitions.dto.ts`). Zod 4 en ambos lados: una sola forma de los datos,
 * validada en el navegador para dar feedback inmediato y en el servidor
 * porque el cliente NUNCA es de fiar.
 */
export const loginSchema = z.object({
  email: z.email({ error: "Ingresá un correo válido" }),
  password: z.string().min(1, { error: "La contraseña es obligatoria" }),
});

export const LINE_TYPES = {
  MATERIAL_OBRA: "Material de obra",
  HERRAMIENTA_EQUIPO: "Herramienta / Equipo",
  DOTACION_PERSONAL: "Dotación de personal",
} as const;

export type LineType = keyof typeof LINE_TYPES;

export const requisitionLineSchema = z
  .object({
    itemId: z.string().min(1, { error: "Seleccioná un artículo" }),
    quantity: z.coerce
      .number()
      .int()
      .positive({ error: "La cantidad debe ser mayor a cero" }),
    justification: z.string().min(3, { error: "Explicá para qué se necesita" }),
    type: z.enum(["MATERIAL_OBRA", "HERRAMIENTA_EQUIPO", "DOTACION_PERSONAL"]),
    // Un <select> sin elegir devuelve "" — NO undefined. Sin este
    // preprocess, ese "" viaja al backend y revienta contra z.uuid().
    // Es exactamente el bug "Invalid uuid" del intento anterior.
    employeeId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().optional(),
    ),
  })
  // ADR-005 replicado en el navegador: el usuario se entera al instante y no
  // después de mandar el formulario. El backend lo valida igual.
  .refine((l) => l.type !== "DOTACION_PERSONAL" || !!l.employeeId, {
    error: "La dotación debe indicar el empleado que la recibe",
    path: ["employeeId"],
  });

export const createRequisitionSchema = z.object({
  lines: z.array(requisitionLineSchema).min(1, {
    error: "Agregá al menos un artículo",
  }),
});

export const rejectSchema = z.object({
  reason: z.string().min(5, { error: "Indicá por qué se rechaza" }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * `z.coerce.number()` hace que la ENTRADA (lo que tipea el usuario: string)
 * difiera de la SALIDA (number). React Hook Form necesita los dos tipos por
 * separado; con uno solo, el resolver no compila.
 */
export type CreateRequisitionFormValues = z.input<
  typeof createRequisitionSchema
>;
export type CreateRequisitionInput = z.output<typeof createRequisitionSchema>;
