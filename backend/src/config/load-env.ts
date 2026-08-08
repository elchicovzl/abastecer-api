import { resolve } from "node:path";

/**
 * Carga `backend/.env` en `process.env` si el archivo existe.
 *
 * Existe porque NADA de nuestro toolchain carga `.env` solo: ni Node, ni
 * `tsx`, ni el CLI de Prisma, ni Vitest. Cada uno fallaba con un error
 * distinto que parecía de otra cosa (conexión, config, permisos) cuando en
 * realidad era siempre lo mismo.
 *
 * `process.loadEnvFile` NO pisa variables ya definidas en el entorno, así
 * que apuntar a otra base con `DATABASE_URL=... comando` sigue funcionando.
 *
 * En CI las variables llegan del entorno y el archivo no existe: por eso no
 * es un error que falte.
 */
export function loadEnvFileIfPresent(cwd: string = process.cwd()): void {
  try {
    process.loadEnvFile(resolve(cwd, ".env"));
  } catch {
    // Sin .env: se asume que las variables ya están en el entorno.
  }
}
