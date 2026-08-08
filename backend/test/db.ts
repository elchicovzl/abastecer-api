import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/prisma/generated/client/client";

/**
 * Cliente Prisma apuntado a la base de TEST (puerto 5433), nunca a la de dev.
 *
 * Prisma 7 exige un driver adapter: la URL ya no viaja en el schema, así que
 * el cliente la recibe explícitamente por acá.
 *
 * Si `TEST_DATABASE_URL` no está definida, ROMPEMOS a propósito en vez de
 * caer a `DATABASE_URL`. Un fallback silencioso haría que los tests trunquen
 * las tablas de la base de desarrollo — y te enterás cuando ya no hay datos.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    "TEST_DATABASE_URL no está definida. Los tests de integración NO caen a " +
      "DATABASE_URL para no truncar la base de desarrollo.",
  );
}

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

/**
 * Orden inverso a las dependencias de FK. TRUNCATE ... CASCADE lo resolvería
 * solo, pero listarlas explícitamente deja a la vista el grafo de dependencias
 * y falla ruidosamente si alguien agrega una tabla y se olvida de limpiarla.
 */
const TABLES_IN_TRUNCATION_ORDER = [
  "audit_logs",
  "delivery_logs",
  "purchase_order_lines",
  "purchase_orders",
  "requisition_lines",
  "requisitions",
  "stock",
  "items",
  "employees",
  "warehouses",
  "refresh_tokens",
  "users",
  "contracts",
] as const;

export async function resetDatabase(): Promise<void> {
  const existing = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const present = new Set(existing.map((r) => r.tablename));
  const toTruncate = TABLES_IN_TRUNCATION_ORDER.filter((t) => present.has(t));

  if (toTruncate.length === 0) return;

  const list = toTruncate.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
