import { nextSeguro, RUTAS_PASAJERO } from "@/lib/pasajero/rutas";

/**
 * URL absoluta del callback de Supabase Auth (solo en el navegador). `next` va codificado:
 * GoTrue rechaza `/` sin codificar cuando la Redirect URL no termina en wildcard.
 */
export function urlCallback(next?: string | null): string {
  const url = new URL(RUTAS_PASAJERO.authCallback, window.location.origin);
  const seguro = nextSeguro(next);
  if (seguro) url.searchParams.set("next", seguro);
  return url.toString();
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function correoValido(v: string): boolean {
  return CORREO.test(v.trim());
}

export const CORREO_ERROR = "Escribe un correo válido, por ejemplo tu@correo.com.";

/**
 * Los campos de las pantallas de acceso se ven igual vacíos o llenos: con borde y fondo del
 * sitio. El `Input` del sistema pinta relleno gris los campos vacíos con placeholder (correo) y
 * con borde los que no lo tienen (contraseña): aquí se unifican en el borde.
 */
export const CLASE_CAMPO_AUTH =
  "placeholder-shown:border-input-border placeholder-shown:bg-background dark:placeholder-shown:border-input-border";
