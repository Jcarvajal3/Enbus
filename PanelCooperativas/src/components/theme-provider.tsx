"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Suppress React 19 false-positive: next-themes injects an inline <script>
// for FOUC prevention that works correctly but triggers this dev warning.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag")
    ) {
      return;
    }
    orig.apply(console, args);
  };
}

/** Pantallas de acceso del panel y del admin: usan el sistema del sitio, siempre en claro. */
const ACCESO = /^\/(cooperativas\/(login|registro|recuperar|restablecer|invite)|admin\/login)(\/|$)/;

/** true en el panel de cooperativas (/cooperativas/…, no la página pública /cooperativas) y en /admin. */
function esPanel(pathname: string) {
  if (ACCESO.test(pathname)) return false;
  return pathname.startsWith("/admin") || (pathname.startsWith("/cooperativas/") && pathname !== "/cooperativas/");
}

/**
 * Proveedor de tema único (D14). El panel y el admin siguen el tema elegido; el sitio
 * público del pasajero (portada, búsqueda, compra, cuenta) es siempre claro, así que ahí
 * se fuerza "light": sin esto, los campos y diálogos compartidos (components/campos, ui)
 * se pintaban oscuros dentro del sitio claro cuando el sistema estaba en modo oscuro.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname() ?? "/";
  return (
    <NextThemesProvider {...props} forcedTheme={esPanel(pathname) ? props.forcedTheme : "light"}>
      {children}
    </NextThemesProvider>
  );
}
