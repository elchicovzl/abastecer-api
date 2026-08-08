import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { BasePage } from "../base-page";

export class RequisitionsPage extends BasePage {
  readonly newButton: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    super(page);
    this.newButton = page.getByRole("link", { name: "Nueva requisición" });
    this.table = page.getByRole("table");
  }

  async goto(): Promise<void> {
    await this.page.goto("/requisitions");
  }

  async openNew(): Promise<void> {
    await this.newButton.click();
    await this.page.waitForURL(/\/requisitions\/new/);
  }

  /**
   * `selectOption({ label })` exige el texto EXACTO — no acepta RegExp.
   * Como las opciones vienen del seed ("MAT-001 · Cemento gris 50kg"), se
   * busca la primera cuyo texto contenga el fragmento y se selecciona por
   * su `value`. Así el test no se acopla al formato completo de la etiqueta.
   */
  private async selectByPartialText(select: Locator, fragment: string): Promise<void> {
    const value = await select
      .locator("option", { hasText: fragment })
      .first()
      .getAttribute("value");

    if (!value) {
      throw new Error(`No hay ninguna opción que contenga "${fragment}"`);
    }
    await select.selectOption(value);
  }

  /** Completa la primera línea del formulario dinámico. */
  async fillFirstLine(options: {
    itemFragment: string;
    quantity: number;
    justification: string;
    type?: "Material de obra" | "Herramienta / Equipo" | "Dotación de personal";
    employeeFragment?: string;
  }): Promise<void> {
    await this.selectByPartialText(
      this.page.getByLabel("Artículo").first(),
      options.itemFragment,
    );
    await this.page.getByLabel("Cantidad").first().fill(String(options.quantity));

    if (options.type) {
      await this.page.getByLabel("Tipo").first().selectOption({ label: options.type });
    }
    if (options.employeeFragment) {
      await this.selectByPartialText(
        this.page.getByLabel("Empleado receptor").first(),
        options.employeeFragment,
      );
    }
    await this.page.getByLabel("Justificación").first().fill(options.justification);
  }

  async submitNew(): Promise<void> {
    await this.page.getByRole("button", { name: "Crear requisición" }).click();
    await this.page.waitForURL(/\/requisitions\/[0-9a-f-]{36}/);
  }

  /** Id de la requisición abierta, leído de la URL. */
  currentId(): string {
    return this.page.url().split("/").pop() ?? "";
  }

  /** BORRADOR → PENDIENTE_INVENTARIO desde el detalle. */
  async sendToInventory(): Promise<void> {
    await this.page.getByRole("button", { name: "Enviar a inventario" }).click();
    await expect(
      this.page.getByRole("button", { name: "Enviar a inventario" }),
    ).toHaveCount(0);
  }

  async expectStatus(status: string): Promise<void> {
    await expect(this.page.getByText(status, { exact: true }).first()).toBeVisible();
  }

  async expectRowCount(min: number): Promise<void> {
    const rows = this.table.getByRole("row");
    // -1 por la fila de encabezado.
    expect((await rows.count()) - 1).toBeGreaterThanOrEqual(min);
  }
}
