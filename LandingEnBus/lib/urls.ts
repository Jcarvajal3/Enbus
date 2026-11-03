// ─── URLs externas de la landing ─────────────────────────────────────────────
// Sin valores por defecto: si falta la variable, la función devuelve null y el
// enlace o botón que la usa no se muestra (nunca se enlaza a localhost).
// Se leen con `process.env.NEXT_PUBLIC_*` literal para que Next las inyecte
// también en los componentes cliente.

/** URL base del panel de cooperativas (sin "/" final), o null si no está configurada. */
export function cooperativasUrl(): string | null {
  const url = (process.env.NEXT_PUBLIC_COOPERATIVAS_URL ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return url.replace(/\/+$/, "");
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

/**
 * Enlace de WhatsApp de soporte (https://wa.me/…), opcionalmente con un mensaje
 * escrito de antemano. null si no hay número configurado.
 */
export function soporteWhatsApp(mensaje?: string): string | null {
  const numero = numeroSoporteWhatsApp();
  if (!numero) return null;
  const texto = mensaje?.trim();
  return texto
    ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/${numero}`;
}
