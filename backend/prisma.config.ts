import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 BREAKING CHANGE: `url` ya no se declara en el bloque
 * `datasource` del schema. La URL para los comandos de migración vive
 * acá, y el cliente en runtime recibe un driver adapter.
 *
 * El CLI de Prisma NO carga `.env` por su cuenta. `process.loadEnvFile()`
 * (Node 20.12+) lo hace sin sumar dependencias. Va en try/catch porque en
 * CI las variables llegan por el entorno y el archivo no existe.
 */
try {
  process.loadEnvFile(new URL(".env", import.meta.url).pathname);
} catch {
  // Sin .env: se asume que las variables ya están en el entorno.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
