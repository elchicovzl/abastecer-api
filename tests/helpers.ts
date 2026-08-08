import type { Page } from "@playwright/test";

/**
 * Utilidades compartidas por los E2E: datos de prueba, setup, teardown.
 * Lo que es interacción con una pantalla va en su Page Object, no acá.
 */

const ROLES = {
  ADMIN: "admin",
  COORDINATOR: "coordinator",
  WAREHOUSE: "warehouse",
  PURCHASING_MANAGER: "purchasing_manager",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface SeedCredential {
  email: string;
  password: string;
  role: Role;
  contractId: string | null;
}

/** Credenciales que crea `prisma/seed.ts` (tarea 2.6). */
export const SEED_USERS: Record<string, SeedCredential> = {
  admin: {
    email: "admin@asofer.com",
    password: "changeme123",
    role: ROLES.ADMIN,
    contractId: null,
  },
  coordinatorA: {
    email: "coord1@asofer.com",
    password: "changeme123",
    role: ROLES.COORDINATOR,
    contractId: "contract-1",
  },
  coordinatorB: {
    email: "coord2@asofer.com",
    password: "changeme123",
    role: ROLES.COORDINATOR,
    contractId: "contract-2",
  },
  warehouse: {
    email: "bodega@asofer.com",
    password: "changeme123",
    role: ROLES.WAREHOUSE,
    contractId: null,
  },
  purchasing: {
    email: "compras@asofer.com",
    password: "changeme123",
    role: ROLES.PURCHASING_MANAGER,
    contractId: null,
  },
};

/** Login por UI. Para setup masivo conviene la API (más rápido). */
export async function loginAs(
  page: Page,
  user: SeedCredential,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(user.email);
  await page.getByLabel(/contraseña/i).fill(user.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

/** Sufijo único para no chocar entre corridas. */
export function uniqueSuffix(): string {
  return `${process.pid}-${performance.now().toString().replace(".", "")}`;
}
