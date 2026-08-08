import { expect, test } from "@playwright/test";

import { SEED_USERS } from "../helpers";
import { LoginPage } from "../login/login-page";
import { PurchaseOrdersPage } from "../purchase-orders/purchase-orders-page";
import { RequisitionsPage } from "../requisitions/requisitions-page";
import { WarehousePage } from "../warehouse/warehouse-page";

/**
 * Tarea 8.2 — el workflow completo de ASOFER, de punta a punta, con tres
 * roles distintos pasándose el trabajo.
 *
 * Es el único test que prueba que las piezas encajan ENTRE SÍ. Los tests de
 * integración verifican cada servicio; este verifica que el coordinador, la
 * bodega y el jefe de compras puedan completar juntos un ciclo real.
 *
 * Se reutilizan los Page Objects de cada pantalla en vez de duplicar
 * selectores acá.
 */
test.describe("workflow completo", () => {
  test.describe.configure({ mode: "serial" });

  test("requisición → verificación de stock → aprobación → recepción", async ({ page }) => {
    // ── 1. El coordinador crea y envía una requisición ────────────────
    const login = new LoginPage(page);
    const requisitions = new RequisitionsPage(page);

    await login.login(SEED_USERS.coordinatorA!);
    await requisitions.openNew();
    await requisitions.fillFirstLine({
      itemFragment: "Cemento gris",
      quantity: 500, // muy por encima del stock sembrado: fuerza la OC
      justification: "Vaciado de placa nivel 3",
      type: "Material de obra",
    });
    await requisitions.submitNew();

    const requisitionUrl = page.url();
    expect(requisitionUrl).toMatch(/\/requisitions\/[0-9a-f-]{36}/);

    // La requisición nace en BORRADOR: hay que enviarla a inventario.
    await requisitions.sendToInventory();
    await requisitions.signOut();

    // ── 2. Bodega verifica el stock ───────────────────────────────────
    const warehouse = new WarehousePage(page);
    await login.login(SEED_USERS.warehouse!);
    await warehouse.goto();
    await warehouse.verifyFirstPending();
    await warehouse.signOut();

    // ── 3. El jefe de compras aprueba la OC generada ──────────────────
    const orders = new PurchaseOrdersPage(page);
    await login.login(SEED_USERS.purchasing!);
    await orders.goto();
    await orders.expectPendingCount(1);
    await orders.approveFirst(28500);
    await orders.signOut();

    // ── 4. Bodega recibe PARCIALMENTE ─────────────────────────────────
    await login.login(SEED_USERS.warehouse!);
    await warehouse.goto();
    await warehouse.receiveFirstOrder(10);

    // Quedó pendiente el resto: la orden NO desaparece de la lista.
    await expect(page.getByText(/RECIBIDA_PARCIAL/).first()).toBeVisible();

    // Y la requisición sigue EN_COMPRA: mientras falte material, la compra
    // no terminó. Todavía no puede entregarse.
    await expect(
      page.getByRole("button", { name: "Registrar entrega" }),
    ).toHaveCount(0);

    // ── 5. Bodega completa la recepción → la requisición avanza ───────
    await warehouse.receiveRemaining();

    // Al completarse, la orden SALE de "por recibir" (ya no hay nada que
    // recibir) y la requisición aparece en "listas para entregar".
    await expect(
      page.getByRole("button", { name: "Registrar entrega" }).first(),
    ).toBeVisible();

    // ── 6. Entrega final: el ciclo CIERRA ─────────────────────────────
    await warehouse.deliverFirst();

    // Este es el assert que faltaba en toda la suite: no que un paso
    // funcionó, sino que el PROCESO llegó a destino.
    // Este es el assert que faltaba en toda la suite: no que un paso
    // funcionó, sino que el PROCESO llegó a destino.
    //
    // Se verifica LA requisición por su URL, no un texto suelto en el
    // listado. Es más preciso —comprueba ESTA y no "alguna"— y de paso evita
    // que el navegador sirva de caché una lista ya visitada.
    await page.goto(requisitionUrl);
    await expect(
      page.getByText("Entregado", { exact: true }).first(),
    ).toBeVisible();
  });
});
