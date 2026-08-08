import { loadEnvFileIfPresent } from "../src/config/load-env";

/**
 * Vitest corre con el root en `backend/`, así que cwd apunta al lugar
 * correcto. Sin esto, `TEST_DATABASE_URL` llega undefined y los tests de
 * integración fallan con un error que parece de base de datos.
 */
loadEnvFileIfPresent();
