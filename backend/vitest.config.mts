import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    // Carga backend/.env antes de todo: Node no lo hace solo.
    setupFiles: ["./test/setup-env.ts"],

    // Vitest 4: `poolOptions.forks.singleFork` fue REMOVIDO.
    // El reemplazo es `fileParallelism: false`, que además fuerza
    // maxWorkers a 1.
    //
    // Por qué importa: los tests de integración de la fase 3 en adelante
    // truncan tablas entre casos contra UNA sola base (puerto 5433).
    // Si los archivos corrieran en paralelo, un test borraría las filas
    // que otro está usando y tendrías fallos intermitentes imposibles
    // de reproducir.
    pool: "forks",
    fileParallelism: false,

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["**/*.spec.ts", "**/main.ts", "**/*.module.ts", "prisma/**"],
    },
  },

  // Vite 8 resuelve los paths del tsconfig de forma nativa —
  // el plugin vite-tsconfig-paths ya no hace falta.
  resolve: {
    tsconfigPaths: true,
  },

  plugins: [
    // CRÍTICO: esbuild (el transformador por defecto de Vitest) NO emite
    // metadata de decorators. Sin SWC acá, la inyección de dependencias de
    // NestJS falla en los tests con "Nest can't resolve dependencies" —
    // aunque la app arranque perfecto con `nest start`.
    swc.vite({ module: { type: "es6" } }),
  ],
});
