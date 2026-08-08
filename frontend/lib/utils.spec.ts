import { describe, expect, it } from "vitest";

import { cn } from "./utils";

/**
 * Test de humo del toolchain del frontend.
 * Si pasa: Vitest resuelve TS, los alias y los imports del proyecto.
 */
describe("cn", () => {
  it("combina clases", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center");
  });

  it("descarta las condicionales falsas", () => {
    expect(cn("flex", false && "hidden")).toBe("flex");
  });

  it("resuelve conflictos de Tailwind quedándose con la última", () => {
    // Esto es lo que clsx solo NO hace: sin twMerge quedarían las dos
    // clases y ganaría la que el CSS defina último — impredecible.
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
