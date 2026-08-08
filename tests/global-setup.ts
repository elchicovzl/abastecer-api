import { PrismaPg } from "@prisma/adapter-pg";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { Client } from "pg";

import { seed } from "../backend/prisma/seed";
import { PrismaClient } from "../backend/src/prisma/generated/client/client";

/**
 * Setup global de los E2E.
 *
 * Los E2E corren contra la base de TEST (:5433), NO contra la de desarrollo.
 * Antes compartían base y arrastraban estado entre corridas: una requisición
 * vieja hacía fallar un test que verificaba "hay 1 orden pendiente", y el
 * fallo parecía un bug de la UI cuando era basura acumulada.
 *
 * Se reconstruye el schema DESDE CERO en cada corrida —no un TRUNCATE— para
 * que la migración también quede ejercitada. Si la migración se rompe, los
 * E2E lo cantan acá y no tres semanas después en un deploy.
 *
 * La base de test vive en tmpfs (RAM) y se destruye al parar el contenedor:
 * reconstruirla no pone en riesgo ningún dato real.
 */
export default async function globalSetup(): Promise<void> {
  process.loadEnvFile(resolve(process.cwd(), "backend/.env"));

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL no está definida. Los E2E NO caen a la base de " +
        "desarrollo: preferimos fallar ruidosamente antes que ensuciarla.",
    );
  }

  // 1. Schema en blanco. Se usa `pg` directo: Prisma necesita que las tablas
  //    existan para conectarse con su cliente generado.
  const raw = new Client({ connectionString: url });
  await raw.connect();
  try {
    await raw.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  } finally {
    await raw.end();
  }

  // 2. Aplicar la migración versionada (la misma que va a producción).
  execSync("npx prisma migrate deploy", {
    cwd: resolve(process.cwd(), "backend"),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  // 3. Sembrar.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }

  console.log("[e2e] base de test reconstruida desde la migración y sembrada");
}
