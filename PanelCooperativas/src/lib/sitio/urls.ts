// ─── URLs y canales del sitio público (portada y páginas legales) ────────────
// Sin valores por defecto: si falta la variable, la función devuelve null y el
// enlace que la usa no se muestra (nunca se enlaza a localhost).
// Se leen con `process.env.NEXT_PUBLIC_*` literal para que Next las inyecte
// también en los componentes cliente.

/**
 * URL pública del sitio (sin "/" final), o null. La usan `metadataBase`, el canonical,
 * `robots.txt` y `sitemap.xml`. Es el mismo dominio del panel: la app y el panel
 * enlazan los términos como `{NEXT_PUBLIC_SITIO_URL}/terminos`.
 */
export function sitioUrl(): string | null {
  const url = (process.env.NEXT_PUBLIC_SITIO_URL ?? "").trim();
  if (!/^https?:\/\/[^/\s]+/i.test(url)) return null;
  return url.replace(/\/+$/, "");
}

/** Rutas de las páginas legales (la app y el panel las enlazan como `{SITIO_URL}{ruta}`). */
export const RUTAS_LEGALES = {
  terminos: "/terminos",
  privacidad: "/privacidad",
  eliminarCuenta: "/eliminar-cuenta",
} as const;

/** Rutas del panel que se anuncian en el sitio. */
export const RUTAS_PANEL = {
  registro: "/cooperativas/registro",
  login: "/cooperativas/login",
} as const;

/** Correo de soporte ("soporte@enbus.com.ve"), o null si no está configurado o no es válido. */
export function correoSoporte(): string | null {
  const correo = (process.env.NEXT_PUBLIC_SOPORTE_CORREO ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : null;
}

/** Número de WhatsApp de soporte en formato internacional ("584121234567"), o null. */
export function numeroSoporteWhatsApp(): string | null {
  const digitos = (process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  // "04121234567" -> "584121234567"; "4121234567" -> "584121234567"
  if (/^0\d{10}$/.test(digitos)) return `58${digitos.slice(1)}`;
  if (/^4\d{9}$/.test(digitos)) return `58${digitos}`;
  return digitos.length >= 10 ? digitos : null;
}

/** Enlace de WhatsApp de soporte (https://wa.me/…), con un mensaje escrito de antemano. null sin número. */
export function soporteWhatsApp(mensaje?: string): string | null {
  const numero = numeroSoporteWhatsApp();
  if (!numero) return null;
  const texto = mensaje?.trim();
  return texto ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : `https://wa.me/${numero}`;
}

function urlTienda(valor: string | undefined): string | null {
  const url = (valor ?? "").trim();
  return /^https:\/\//i.test(url) ? url : null;
}

/** Enlaces de la app en las tiendas. Mientras no esté publicada, null (el sitio dice "pronto"). */
export function tiendasApp(): { android: string | null; ios: string | null } {
  return {
    android: urlTienda(process.env.NEXT_PUBLIC_APP_ANDROID_URL),
    ios: urlTienda(process.env.NEXT_PUBLIC_APP_IOS_URL),
  };
}
