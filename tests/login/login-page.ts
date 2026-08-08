import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { BasePage } from "../base-page";
import type { SeedCredential } from "../helpers";

/**
 * Selectores por rol y label, nunca por CSS ni id: un cambio de estilos no
 * debe romper un test. `getByLabel` además falla si el <label> no está bien
 * asociado al input — o sea que el test verifica accesibilidad de yapa.
 */
export class LoginPage extends BasePage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    super(page);
    this.email = page.getByLabel("Correo");
    this.password = page.getByLabel("Contraseña");
    this.submit = page.getByRole("button", { name: "Ingresar" });
    this.error = page.getByRole("alert");
  }

  async goto(): Promise<void> {
    await this.page.goto("/login");
  }

  async login(user: SeedCredential): Promise<void> {
    await this.goto();
    await this.email.fill(user.email);
    await this.password.fill(user.password);
    await this.submit.click();
    await this.page.waitForURL((url) => !url.pathname.includes("/login"));
  }

  async expectLoginFailed(): Promise<void> {
    await expect(this.error).toBeVisible();
    await expect(this.page).toHaveURL(/\/login/);
  }
}
