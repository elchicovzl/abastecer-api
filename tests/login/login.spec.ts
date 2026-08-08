import { expect, test } from "@playwright/test";

import { SEED_USERS } from "../helpers";
import { LoginPage } from "./login-page";

test.describe("login", () => {
  test("cada rol aterriza en su pantalla de trabajo", async ({ page }) => {
    const login = new LoginPage(page);

    await login.login(SEED_USERS.coordinatorA!);
    await expect(page).toHaveURL(/\/requisitions/);
  });

  test("bodega entra directo a su pantalla", async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(SEED_USERS.warehouse!);
    await expect(page).toHaveURL(/\/warehouse/);
  });

  test("el jefe de compras entra a órdenes de compra", async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(SEED_USERS.purchasing!);
    await expect(page).toHaveURL(/\/purchase-orders/);
  });

  test("credenciales incorrectas muestran error y no dejan pasar", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.email.fill("admin@asofer.com");
    await login.password.fill("clave-incorrecta");
    await login.submit.click();
    await login.expectLoginFailed();
  });

  test("sin sesión, cualquier ruta interna redirige al login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
