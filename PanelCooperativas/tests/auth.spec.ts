import { test, expect } from "@playwright/test";

test.describe("Flujo de Autenticación y Recuperación (F-03)", () => {
  test("debe cargar la página de login y mostrar todos los elementos clave", async ({ page }) => {
    await page.goto("/cooperativas/login");
    
    // Verificar que el título principal de la sección está presente
    await expect(page.locator("h1")).toContainText("Panel de");
    await expect(page.locator("h1")).toContainText("Cooperativas");
    
    // Verificar formulario
    const cardTitle = page.locator("[data-slot='card-title']:has-text('Iniciar sesión')");
    await expect(cardTitle).toBeVisible();
    
    const emailInput = page.locator("input[type='email']");
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("placeholder", "nombre@cooperativa.com");
    
    const passwordInput = page.locator("input[type='password']");
    await expect(passwordInput).toBeVisible();
    
    const submitBtn = page.locator("button[type='submit']");
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText("Iniciar sesión");
  });

  test("debe validar credenciales vacías en el login", async ({ page }) => {
    await page.goto("/cooperativas/login");
    
    // Submit empty fields
    const submitBtn = page.locator("button[type='submit']");
    await submitBtn.click();
    
    // HTML5 validation check (empty fields won't submit and should report validity status)
    const emailInput = page.locator("input[type='email']");
    const isRequired = await emailInput.evaluate((el: HTMLInputElement) => el.required);
    expect(isRequired).toBe(true);
  });

  test("debe navegar al flujo de recuperación de contraseña", async ({ page }) => {
    await page.goto("/cooperativas/login");
    
    // Hacer clic en "¿Olvidaste tu contraseña?"
    const recoverLink = page.locator("a:has-text('¿Olvidaste tu contraseña?')");
    await expect(recoverLink).toBeVisible();
    await recoverLink.click();
    
    // Debe redirigir a /cooperativas/recuperar
    await expect(page).toHaveURL("/cooperativas/recuperar");
    
    // Verificar elementos de la página de recuperación
    const title = page.locator("[data-slot='card-title']:has-text('¿Olvidaste tu contraseña?')");
    await expect(title).toBeVisible();
    
    const emailInput = page.locator("input[type='email']");
    await expect(emailInput).toBeVisible();
    
    // Verificar enlace de regreso al login
    const backLink = page.locator("a:has-text('Volver')");
    await expect(backLink).toBeVisible();
    await backLink.click();
    
    await expect(page).toHaveURL("/cooperativas/login");
  });

  test("debe validar la página de restablecer contraseña sin token", async ({ page }) => {
    // Si se accede directamente a /cooperativas/restablecer sin token o sesión activa
    await page.goto("/cooperativas/restablecer");

    // Debe decir que el enlace no sirve y ofrecer pedir otro
    const errorAlert = page.locator("[data-slot='alert-title']:has-text('El enlace venció o ya se usó')");
    await expect(errorAlert).toBeVisible();

    const otroEnlace = page.locator("button:has-text('Pedir otro enlace')");
    await expect(otroEnlace).toBeVisible();
    await otroEnlace.click();

    await expect(page).toHaveURL("/cooperativas/recuperar");
  });

  test("sin sesión, el panel lleva al login (sin bucle de redirecciones)", async ({ page }) => {
    const respuesta = await page.goto("/cooperativas/dashboard");
    expect(respuesta?.ok()).toBe(true);
    await expect(page).toHaveURL("/cooperativas/login");
    await expect(page.locator("input[type='email']")).toBeVisible();
  });

  test("el login explica cuando la cuenta no tiene acceso al panel", async ({ page }) => {
    await page.goto("/cooperativas/login?error=sin-acceso");
    await expect(page.locator("[data-slot='alert-description']")).toContainText("No pudimos abrir el panel");
    await expect(page.locator("input[type='email']")).toBeVisible();
  });
});
