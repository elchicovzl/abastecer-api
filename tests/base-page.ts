import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Clase padre de TODOS los Page Objects.
 *
 * Acá va lo que comparten varias pantallas: navegación, notificaciones,
 * sesión. Lo específico de una pantalla va en su propio Page Object.
 *
 * Regla de selectores del proyecto:
 *   getByRole > getByLabel > getByText > getByTestId
 * NUNCA selectores CSS o de id (`.btn-primary`, `#email`): se rompen
 * apenas alguien toca el estilo, y ahí empiezan los tests flaky.
 */
export abstract class BasePage {
  protected readonly notification: Locator;

  constructor(protected readonly page: Page) {
    this.notification = page.getByRole("status");
  }

  abstract goto(): Promise<void>;

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }

  getCurrentUrl(): string {
    return this.page.url();
  }

  async expectNotification(text: string | RegExp): Promise<void> {
    await expect(this.notification).toContainText(text);
  }

  async signOut(): Promise<void> {
    await this.page.getByRole("button", { name: /cerrar sesión/i }).click();
    await this.page.waitForURL(/\/login/);
  }
}
