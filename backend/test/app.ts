import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { AppModule } from "../src/app.module";

/**
 * Levanta la app completa contra la base de TEST.
 *
 * Se usa el AppModule real, no un módulo recortado: los guards son globales
 * y un módulo de mentira los dejaría fuera, que es justo lo que hay que
 * verificar. Un test de seguridad que no ejercita el guard real no prueba nada.
 */
export async function createTestApp(
  extraModules: unknown[] = [],
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(extraModules as never[])],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  // Sin ValidationPipe de Nest: exige class-validator, y este proyecto valida
  // con Zod (ZodValidationPipe por ruta) para compartir schemas con el front.
  await app.init();
  return app;
}
