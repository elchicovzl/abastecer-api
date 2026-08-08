import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";

/**
 * Test de humo del TOOLCHAIN, no del negocio.
 *
 * Si este test pasa, quedó probado que:
 *  1. Vitest resuelve TypeScript y los paths del tsconfig
 *  2. SWC está emitiendo metadata de decorators — sin esto la inyección
 *     de dependencias de Nest falla SOLO en tests, y perdés horas
 *     buscando el problema en el código de negocio cuando en realidad
 *     está en la config del runner
 *  3. El módulo raíz compila y el contenedor de DI arranca
 *
 * Se borra recién cuando la fase 3 traiga tests reales.
 */
describe("toolchain", () => {
  it("compila el módulo raíz y resuelve la inyección de dependencias", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(ConfigModule)).toBeDefined();
    await moduleRef.close();
  });
});
