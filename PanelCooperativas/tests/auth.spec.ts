import { test, expect } from "@playwright/test";

test.describe("Flujo de Autenticación y Recuperación (F-03)", () => {
  test("debe cargar la página de login y mostrar todos los elementos clave", async ({ page }) => {
    await page.goto("/cooperativas/login");

    // Verificar que el título principal de la sección y del formulario están presentes
    await expect(page.getByText("Panel de cooperativas")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeVisible();

    const emailInput = page.getByLabel("Correo", { exact: true });
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("type", "email");
    await expect(emailInput).toHaveAttribute("placeholder", "Ej. tu@correo.com");

    const passwordInput = page.getByLabel("Contraseña", { exact: true });
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute("type", "password");

    const submitBtn = page.getByRole("button", { name: "Entrar", exact: true });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toHaveAttribute("type", "submit");

    const googleBtn = page.getByRole("button", { name: "Continuar con Google", exact: true });
    await expect(googleBtn).toBeVisible();

    const registroLink = page.getByRole("link", { name: "Registra tu cooperativa" });
    await expect(registroLink).toBeVisible();
    await expect(registroLink).toHaveAttribute("href", "/cooperativas/registro");
  });

  test("debe validar credenciales vacías en el login", async ({ page }) => {
    await page.goto("/cooperativas/login");

    const submitBtn = page.getByRole("button", { name: "Entrar", exact: true });
    await submitBtn.click();

    // Validación HTML5: los campos requeridos impiden enviar el formulario vacío
    const emailInput = page.getByLabel("Correo", { exact: true });
    const isRequired = await emailInput.evaluate((el: HTMLInputElement) => el.required);
    expect(isRequired).toBe(true);
    await expect(page).toHaveURL("/cooperativas/login");
  });

  test("debe navegar al flujo de recuperación de contraseña", async ({ page }) => {
    await page.goto("/cooperativas/login");

    const recoverLink = page.getByRole("link", { name: "¿Olvidaste tu contraseña?" });
    await expect(recoverLink).toBeVisible();
    await recoverLink.click();

    await expect(page).toHaveURL("/cooperativas/recuperar");

    await expect(page.getByRole("heading", { level: 1, name: "Recuperar contraseña" })).toBeVisible();

    const emailInput = page.getByLabel("Correo", { exact: true });
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("placeholder", "Ej. tu@correo.com");

    const backLink = page.getByRole("link", { name: "Volver a iniciar sesión" });
    await expect(backLink).toBeVisible();
    await backLink.click();

    await expect(page).toHaveURL("/cooperativas/login");
  });

  test("debe validar la página de restablecer contraseña sin token", async ({ page }) => {
    // Si se accede directamente a /cooperativas/restablecer sin token o sesión activa
    await page.goto("/cooperativas/restablecer");

    await expect(page.getByRole("heading", { level: 1, name: "Nueva contraseña" })).toBeVisible();

    // Debe decir que el enlace no sirve y ofrecer pedir otro
    const errorAlert = page.locator("[data-slot='alert-title']");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("El enlace venció o ya se usó");

    const otroEnlace = page.getByRole("link", { name: "Pedir otro enlace" });
    await expect(otroEnlace).toBeVisible();
    await expect(otroEnlace).toHaveAttribute("href", "/cooperativas/recuperar");
    await otroEnlace.click();

    await expect(page).toHaveURL("/cooperativas/recuperar");
  });

  test("sin sesión, el panel lleva al login (sin bucle de redirecciones)", async ({ page }) => {
    const respuesta = await page.goto("/cooperativas/dashboard");
    expect(respuesta?.ok()).toBe(true);
    await expect(page).toHaveURL("/cooperativas/login");
    await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  });

  test("el login explica cuando la cuenta no tiene acceso al panel", async ({ page }) => {
    await page.goto("/cooperativas/login?error=sin-acceso");
    await expect(page.locator("[data-slot='alert-title']")).toContainText("Esta cuenta no tiene acceso");
    await expect(page.locator("[data-slot='alert-description']")).toContainText("No pudimos abrir el panel");
    await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  });

  test("el login muestra aviso cuando falla el acceso con Google", async ({ page }) => {
    await page.goto("/cooperativas/login?error=google");
    await expect(page.locator("[data-slot='alert-title']")).toContainText("No pudiste entrar con Google");
    await expect(page.locator("[data-slot='alert-description']")).toContainText(
      "Intenta de nuevo o usa tu correo y contraseña."
    );
    await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  });
});

test.describe("Registro de Cooperativa (Paso 1 de 2)", () => {
  test("debe cargar en el paso 1 de 2 sin mostrar los campos de onboarding", async ({ page }) => {
    await page.goto("/cooperativas/registro");

    await expect(page.getByText("Panel de cooperativas")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Registrar cooperativa" })).toBeVisible();
    await expect(page.getByText("Paso 1 de 2 · Crea tu cuenta de administrador")).toBeVisible();

    const emailInput = page.getByLabel("Correo", { exact: true });
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("placeholder", "Ej. tu@correo.com");

    const passwordInput = page.locator("#password");
    await expect(passwordInput).toBeVisible();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();

    const confirmPasswordInput = page.locator("#confirmPassword");
    await expect(confirmPasswordInput).toBeVisible();
    await expect(page.getByLabel("Repite la contraseña", { exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Continuar", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar con Google", exact: true })).toBeVisible();

    await expect(page.locator("#nombre")).toBeHidden();
    await expect(page.locator("#rif")).toBeHidden();
    await expect(page.locator("#telefono")).toBeHidden();
    await expect(page.locator("#representante")).toBeHidden();

    const loginLink = page.getByRole("link", { name: "Inicia sesión" });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute("href", "/cooperativas/login");
  });

  test("debe validar en cliente los campos del paso 1 sin avanzar al paso 2", async ({ page }) => {
    await page.goto("/cooperativas/registro");

    const continuarBtn = page.getByRole("button", { name: "Continuar", exact: true });
    const emailInput = page.getByLabel("Correo", { exact: true });
    const passwordInput = page.locator("#password");
    const confirmPasswordInput = page.locator("#confirmPassword");

    // 1. Enviar vacío
    await continuarBtn.click();

    await expect(page.locator("#email-error")).toContainText("Escribe un correo válido, por ejemplo tu@correo.com.");
    await expect(page.locator("#password-error")).toContainText("Usa al menos 8 caracteres.");
    await expect(page.getByText("Paso 1 de 2 · Crea tu cuenta de administrador")).toBeVisible();
    await expect(page.locator("#nombre")).toBeHidden();

    // 2. Correo inválido y contraseña menor a 8 caracteres
    await emailInput.fill("correo-invalido");
    await passwordInput.fill("1234567");
    await confirmPasswordInput.fill("7654321");
    await continuarBtn.click();

    await expect(page.locator("#email-error")).toContainText("Escribe un correo válido, por ejemplo tu@correo.com.");
    await expect(page.locator("#password-error")).toContainText("Usa al menos 8 caracteres.");
    await expect(page.getByText("Paso 1 de 2 · Crea tu cuenta de administrador")).toBeVisible();
    await expect(page.locator("#nombre")).toBeHidden();

    // 3. Contraseñas de 8+ caracteres que no coinciden
    await emailInput.fill("admin@cooperativa.com");
    await passwordInput.fill("clave1234");
    await confirmPasswordInput.fill("otra12345");
    await continuarBtn.click();

    await expect(page.locator("#email-error")).toBeHidden();
    await expect(page.locator("#password-error")).toBeHidden();
    await expect(page.locator("#confirmPassword-error")).toContainText("Las contraseñas no coinciden.");
    await expect(page.getByText("Paso 1 de 2 · Crea tu cuenta de administrador")).toBeVisible();
    await expect(page.locator("#nombre")).toBeHidden();
  });

  test("el registro muestra aviso cuando falla el acceso con Google", async ({ page }) => {
    await page.goto("/cooperativas/registro?error=google");

    await expect(page.locator("[data-slot='alert-title']")).toContainText("No pudiste entrar con Google");
    await expect(page.locator("[data-slot='alert-description']")).toContainText(
      "Intenta de nuevo o crea tu cuenta con correo y contraseña."
    );
    await expect(page.getByRole("heading", { level: 1, name: "Registrar cooperativa" })).toBeVisible();
  });
});

