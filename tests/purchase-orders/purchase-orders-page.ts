import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { BasePage } from "../base-page";

export class PurchaseOrdersPage extends BasePage {
  readonly approveButtons: Locator;
  readonly rejectButtons: Locator;

  constructor(page: Page) {
    super(page);
    this.approveButtons = page.getByRole("button", { name: "Aprobar" });
    this.rejectButtons = page.getByRole("button", { name: "Rechazar" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/purchase-orders");
  }

  async expectPendingCount(min: number): Promise<void> {
    expect(await this.approveButtons.count()).toBeGreaterThanOrEqual(min);
  }

  /** Aprueba la primera orden pendiente, fijando el precio unitario. */
  async approveFirst(unitPrice: number): Promise<void> {
    await expect(this.approveButtons.first()).toBeVisible();
    await this.page.getByLabel("Precio unitario").first().fill(String(unitPrice));
    await this.approveButtons.first().click();
    await this.page.waitForLoadState("networkidle");
  }

  /** El motivo es obligatorio: sin él, el backend responde 400. */
  async rejectFirst(reason: string): Promise<void> {
    await this.rejectButtons.first().click();
    await this.page.getByLabel("Motivo del rechazo").fill(reason);
    await this.page.getByRole("button", { name: "Confirmar rechazo" }).click();
    await this.page.waitForLoadState("networkidle");
  }
}
