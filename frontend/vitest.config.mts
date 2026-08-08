import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    // Solo unit/component. Los E2E son de Playwright y viven en tests/ raíz;
    // si Vitest los levantara, intentaría correrlos sin navegador.
    include: ["**/*.spec.ts", "**/*.spec.tsx"],
    exclude: ["node_modules/**", ".next/**", "../tests/**"],
  },
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./") },
  },
});
