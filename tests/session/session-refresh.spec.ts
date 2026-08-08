import { expect, test } from "@playwright/test";

import { SEED_USERS } from "../helpers";
import { LoginPage } from "../login/login-page";

/**
 * Renovación de sesión con el access token vencido.
 *
 * EL BUG QUE PREVIENE: `api()` corre dentro del render de un Server
 * Component. Cuando el access token expiraba (15 min), intentaba renovarlo
 * y ESCRIBIR la cookie durante el render — algo que Next prohíbe. La página
 * entera reventaba con un 500.
 *
 * No lo detectó ningún test porque hacía falta esperar 15 minutos. Acá se
 * simula borrando la cookie de access y dejando viva la de refresh: es
 * exactamente el estado en el que queda el navegador cuando el token
 * caduca.
 */
test.describe("renovación de sesión", () => {
  test("con el access vencido, la app renueva y sigue funcionando", async ({
    page,
    context,
  }) => {
    const login = new LoginPage(page);
    await login.login(SEED_USERS.coordinatorA!);

    // Simular expiración: se borra SOLO el access, el refresh sigue vivo.
    const antes = await context.cookies();
    await context.clearCookies();
    await context.addCookies(
      antes.filter((c) => c.name !== "asofer_access"),
    );

    const response = await page.goto("/requisitions");

    // Antes: 500 "Cookies can only be modified in a Server Action".
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Requisiciones" }),
    ).toBeVisible();

    // Y el token quedó PERSISTIDO: el middleware lo escribió en el navegador.
    const despues = await context.cookies();
    expect(despues.find((c) => c.name === "asofer_access")?.value).toBeTruthy();
  });

  test("sin access NI refresh, manda al login en vez de romper", async ({
    page,
    context,
  }) => {
    const login = new LoginPage(page);
    await login.login(SEED_USERS.warehouse!);

    const antes = await context.cookies();
    await context.clearCookies();
    await context.addCookies(
      antes.filter((c) => c.name === "asofer_user"),
    );

    await page.goto("/warehouse");
    await expect(page).toHaveURL(/\/login/);
  });
});
