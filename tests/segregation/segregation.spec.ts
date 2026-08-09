import { expect, test } from "@playwright/test";

import { SEED_USERS } from "../helpers";
import { LoginPage } from "../login/login-page";
import { RequisitionsPage } from "../requisitions/requisitions-page";

/**
 * Tarea 8.3 — LA verificación de seguridad del sistema.
 *
 * ASOFER tiene 12 coordinadores sobre 9 contratos. Una sola falla de scope
 * expone costos, proveedores y consumos de obras que no le corresponden a
 * quien mira. Este test existe para que esa falla no llegue nunca a
 * producción sin que alguien se entere.
 *
 * Se prueba de los dos lados: lectura (no ve) y escritura (no toca).
 */
test.describe("segregación entre contratos", () => {
  test.describe.configure({ mode: "serial" });

  let idDeOtroContrato: string;

  test("el coordinador B crea una requisición en SU contrato", async ({ page }) => {
    const login = new LoginPage(page);
    const requisitions = new RequisitionsPage(page);

    await login.login(SEED_USERS.coordinatorB!);
    await requisitions.openNew();
    await requisitions.fillFirstLine({
      itemFragment: "Arena de río",
      quantity: 3,
      justification: "Mezcla para muro de contención",
      type: "Material de obra",
    });
    await requisitions.submitNew();

    idDeOtroContrato = requisitions.currentId();
    expect(idDeOtroContrato).toHaveLength(36);
    await requisitions.signOut();
  });

  test("el coordinador A ve la SUYA y no la de B", async ({ page }) => {
    const login = new LoginPage(page);
    const requisitions = new RequisitionsPage(page);

    await login.login(SEED_USERS.coordinatorA!);

    // A crea la suya. Sin esto el test compararía contra una lista vacía, y
    // "no veo nada" pasaría aunque el filtro estuviera roto: una lista vacía
    // no prueba que el scope funcione, solo que no hay datos.
    await requisitions.openNew();
    await requisitions.fillFirstLine({
      itemFragment: "Cemento gris",
      quantity: 2,
      justification: "Prueba de segregación",
      type: "Material de obra",
    });
    await requisitions.submitNew();
    const propia = requisitions.currentId();

    await requisitions.goto();

    // Ve la suya…
    await expect(
      page.getByRole("link", { name: "Ver detalle" }).first(),
    ).toBeVisible();
    // …y NO la de B.
    await expect(page.getByText(idDeOtroContrato)).toHaveCount(0);
    expect(propia).not.toBe(idDeOtroContrato);
  });

  test("ADR-008: entrar por URL directa a una requisición ajena da 404", async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(SEED_USERS.coordinatorA!);

    const response = await page.goto(`/requisitions/${idDeOtroContrato}`);

    // 404 y NO 403: un 403 confirmaría que el recurso existe, y eso ya es
    // filtración entre contratos.
    expect(response?.status()).toBe(404);
  });

  test("un id inexistente da el MISMO 404 que uno ajeno", async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(SEED_USERS.coordinatorA!);

    const response = await page.goto(
      "/requisitions/00000000-0000-0000-0000-000000000000",
    );
    // Indistinguibles: si difirieran, el código de estado sería un oráculo
    // para descubrir qué ids existen en los otros contratos.
    expect(response?.status()).toBe(404);
  });

  test("el coordinador NO puede entrar a bodega ni a compras", async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(SEED_USERS.coordinatorA!);

    await page.goto("/warehouse");
    await expect(page).toHaveURL(/\/requisitions/);

    await page.goto("/purchase-orders");
    await expect(page).toHaveURL(/\/requisitions/);
  });

  test("el coordinador SÍ entra a administración, pero no a usuarios", async ({
    page,
  }) => {
    const login = new LoginPage(page);
    await login.login(SEED_USERS.coordinatorA!);

    // Entra: necesita cargar los empleados de su contrato para poder crear
    // requisiciones de dotación.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText("Empleados").first()).toBeVisible();

    // Pero la gestión de usuarios sigue siendo del ADMIN.
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/requisitions/);
  });

  test("el dashboard del coordinador no ofrece elegir otro contrato", async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(SEED_USERS.coordinatorA!);
    await page.goto("/dashboard");

    // Sin selector: no hay nada que elegir, y ofrecerlo sería mentirle.
    await expect(page.getByLabel("Contrato")).toHaveCount(0);
    await expect(page.getByText("Métricas de tu contrato")).toBeVisible();
  });
});
