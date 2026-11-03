/**
 * Canal de ayuda por WhatsApp (#28) y páginas legales del sitio (#50).
 *
 * El número de soporte viene de `EXPO_PUBLIC_SOPORTE_WHATSAPP` (en `.env.local`
 * y en EAS). Si falta, `SOPORTE_WHATSAPP` es `null` y las pantallas no
 * muestran el botón: nunca se ofrece un canal que no existe.
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

/**
 * Número en formato internacional, solo dígitos ("584141234567").
 * Acepta 0414…, 414…, +58 414…; otros países se dejan tal cual (8 a 15 dígitos).
 */
function numeroWhatsApp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? '').replace(/\D/g, '');
  if (/^58[24]\d{9}$/.test(d)) return d;
  if (/^0[24]\d{9}$/.test(d)) return `58${d.slice(1)}`;
  if (/^[24]\d{9}$/.test(d)) return `58${d}`;
  if (d.length >= 8 && d.length <= 15 && !d.startsWith('0')) return d;
  return null;
}

/** Número de soporte (solo dígitos, con 58) o `null` si no está configurado. */
export const SOPORTE_WHATSAPP: string | null = numeroWhatsApp(process.env.EXPO_PUBLIC_SOPORTE_WHATSAPP);

/**
 * Abre WhatsApp con un mensaje listo para enviar. Devuelve `false` si el número
 * no es válido o el teléfono no pudo abrir el enlace (la pantalla decide qué decir).
 */
export async function abrirWhatsApp(telefono: string, mensaje: string): Promise<boolean> {
  const numero = numeroWhatsApp(telefono);
  if (!numero) return false;
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escribe al soporte de EnBus. `contexto` se añade al saludo, p. ej.
 * "Boleto BOL-7CAB-E4AD" o "Encomienda EB-261003-12345".
 * Devuelve `false` si no hay número configurado o no se pudo abrir WhatsApp.
 */
export async function abrirSoporteWhatsApp(contexto?: string): Promise<boolean> {
  if (!SOPORTE_WHATSAPP) return false;
  const extra = contexto?.trim();
  const mensaje = `Hola, necesito ayuda con EnBus.${extra ? ` ${extra}` : ''}`;
  return abrirWhatsApp(SOPORTE_WHATSAPP, mensaje);
}

// ─── Páginas legales en el sitio web (#50) ────────────────────────────────────


/**
 * Sitio público de EnBus (`EXPO_PUBLIC_SITIO_URL`, p. ej. "https://enbus.app"),
 * sin "/" final. `null` si falta o no es https: las pantallas no muestran
 * enlaces a páginas que no existen.
 */
export const SITIO_URL: string | null = (() => {
  const url = (process.env.EXPO_PUBLIC_SITIO_URL ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+/i.test(url) ? url : null;
})();

/**
 * Abre `/terminos`, `/privacidad` o `/eliminar-cuenta` del sitio en el
 * navegador dentro de la app. Devuelve `false` si no hay `SITIO_URL` o no se
 * pudo abrir (la pantalla decide qué decir).
 */
export async function abrirPaginaLegal(
  pagina: 'terminos' | 'privacidad' | 'eliminar-cuenta'
): Promise<boolean> {
  if (!SITIO_URL) return false;
  try {
    await WebBrowser.openBrowserAsync(`${SITIO_URL}/${pagina}`);
    return true;
  } catch {
    return false;
  }
}
