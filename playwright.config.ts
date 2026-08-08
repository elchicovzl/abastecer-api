import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",

  // Resetea y siembra la base de TEST antes de cada corrida: sin esto, los
  // E2E arrastran estado entre ejecuciones y fallan por datos viejos.
  globalSetup: "./tests/global-setup.ts",
  testMatch: "**/*.spec.ts",
  fullyParallel: false, // los E2E comparten una sola base sembrada
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "html" : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3010",
    // Trace solo en el primer reintento: capturarlo siempre es lentísimo
    // y deja gigas de artefactos que nadie mira.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Levanta backend y frontend solos. Sin esto, cada quien tiene que
  // acordarse de arrancar los dos servidores antes de correr los E2E.
  // Servidores PROPIOS en puertos PROPIOS (3101/3010), nunca los de
  // desarrollo (3100/3000).
  //
  // `reuseExistingServer: false` es deliberado y costó descubrirlo: con
  // `true`, Playwright reutilizaba el backend de desarrollo —que corre con
  // NODE_ENV=development— y los E2E terminaban escribiendo en la base de
  // DESARROLLO mientras globalSetup reseteaba la de TEST. Los tests fallaban
  // por datos que estaban en otra base.
  webServer: [
    {
      // NODE_ENV=test hace que PrismaService apunte a TEST_DATABASE_URL.
      command:
        "NODE_ENV=test PORT=3101 npm run start:dev --workspace=backend",
      url: "http://localhost:3101/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Build de PRODUCCIÓN, no `next dev`. Dos razones:
      //  1. Next 16 tiene un lock por proyecto: se niega a levantar un
      //     segundo `next dev` del mismo directorio aunque cambies el puerto.
      //  2. Es más honesto: los E2E prueban lo que se despliega, no el dev
      //     server con sus overlays y su Fast Refresh.
      command:
        "API_URL=http://localhost:3101/api npm run build --workspace=frontend && " +
        "API_URL=http://localhost:3101/api PORT=3010 npm run start --workspace=frontend",
      url: "http://localhost:3010",
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
