import type { INestApplication } from "@nestjs/common";
import type { Server } from "node:http";
import request from "supertest";

import type { Role } from "../src/prisma/generated/client/client";

/**
 * `app.getHttpServer()` devuelve `any`, y supertest tipa `res.body` como
 * `any` también. Con las reglas type-checked de typescript-eslint eso es un
 * error en cada línea que toca el body.
 *
 * En vez de apagar la regla —que es la que evita que un `any` se filtre al
 * código de producción— se centraliza el cast acá, una sola vez, y los tests
 * trabajan con tipos reales.
 */
export const http = (app: INestApplication) => request(app.getHttpServer() as Server);

export interface LoginBody {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: Role; contractId: string | null };
}

export interface RefreshBody {
  accessToken: string;
}

/** Lee el body con el tipo esperado en vez de propagar `any`. */
export function body<T>(res: { body: unknown }): T {
  return res.body as T;
}
