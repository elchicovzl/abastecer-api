import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Valida el body con un schema de Zod.
 *
 * Zod y no class-validator porque los mismos schemas se comparten con el
 * frontend: una sola definición de la forma de los datos, validada en los dos
 * lados. Dos librerías de validación serían dos fuentes de verdad.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Datos inválidos",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
