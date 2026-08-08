import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { BasePage } from "../base-page";

export class WarehousePage extends BasePage {
  readonly verifyButtons: Locator;
  readonly receiveButtons: Locator;

  constructor(page: Page) {
    super(page);
    this.verifyButtons = page.getByRole("button", { name: "Verificar stock" });
    this.receiveButtons = page.getByRole("button", { name: "Registrar recepción" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/warehouse");
  }

  async verifyFirstPending(): Promise<void> {
    await expect(this.verifyButtons.first()).toBeVisible();
    await this.verifyButtons.first().click();
    // La Server Action revalida y la lista se vuelve a pintar.
    await this.page.waitForLoadState("networkidle");
  }

  /** Recibe `quantity` unidades de la primera línea de la primera orden. */
  async receiveFirstOrder(quantity: number): Promise<void> {
    await expect(this.receiveButtons.first()).toBeVisible();
    await this.page.getByLabel("Recibir ahora").first().fill(String(quantity));
    await this.receiveButtons.first().click();
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Recibe TODO lo que queda pendiente.
   *
   * El input ya viene precargado con la cantidad pendiente, así que no se
   * toca: escribir un número mayor haría que el backend lo rechace con
   * "no se puede recibir más de lo pedido" (ADR-003), y el test fallaría
   * por un dato inventado en vez de por un bug real.
   */
  async receiveRemaining(): Promise<void> {
    const antes = await this.receiveButtons.count();
    await expect(this.receiveButtons.first()).toBeVisible();
    await this.receiveButtons.first().click();
    // Se espera la CONFIRMACIÓN en la UI, no `networkidle`: la Server Action
    // y su revalidación siguen corriendo después de que la red se calla.
    await expect(this.receiveButtons).toHaveCount(antes - 1);
  }

  /** Entrega final: cierra la requisición (RECIBIDO_EN_BODEGA → ENTREGADO). */
  async deliverFirst(): Promise<void> {
    const boton = this.page.getByRole("button", { name: "Registrar entrega" });
    const antes = await boton.count();
    await expect(boton.first()).toBeVisible();
    await boton.first().click();
    // Igual que arriba: la requisición sale de "listas para entregar" cuando
    // la acción TERMINÓ. Navegar antes mostraría el estado viejo, y el test
    // culparía a la UI de un problema de sincronización del propio test.
    await expect(boton).toHaveCount(antes - 1);
  }

  async expectLowStockAlert(sku: string): Promise<void> {
    await expect(this.page.getByText(new RegExp(sku))).toBeVisible();
  }
}
