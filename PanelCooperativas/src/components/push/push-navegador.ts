// ─── Notificaciones push: lado del navegador ────────────────────────────────
// Detecta si este equipo puede recibir avisos, suscribe/desuscribe con la
// clave pública VAPID y sincroniza la suscripción con el servidor (server
// actions de hardware/actions.ts). Sin React: lo usan el hook use-push-panel,
// el registrador del service worker y quien cierre la sesión.
//
// Requisitos: service worker registrado (producción o NEXT_PUBLIC_SW_ENABLED),
// HTTPS y NEXT_PUBLIC_VAPID_PUBLIC_KEY. En iPhone/iPad solo con el panel
// instalado en la pantalla de inicio (iOS 16.4+).

import { eliminarSuscripcionPush, guardarSuscripcionPush } from "@/app/cooperativas/(panel)/hardware/actions";

export type EstadoPush =
  | "cargando"
  /** El navegador no tiene Push API (o iOS anterior a 16.4). */
  | "no-soportado"
  /** iPhone/iPad en Safari sin instalar: hay que añadirlo a la pantalla de inicio. */
  | "instalar-ios"
  /** Sin service worker (desarrollo sin NEXT_PUBLIC_SW_ENABLED). */
  | "sin-service-worker"
  /** Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el despliegue. */
  | "sin-configurar"
  /** El permiso está denegado en el navegador. */
  | "bloqueadas"
  | "desactivadas"
  | "activadas";

const SCOPE = "/cooperativas/";
const ESPERA_SW_MS = 4000;
const ICONO = "/icon-192.png";

export const CLAVE_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Panel abierto como app instalada (pantalla de inicio / ventana propia). */
export function esAppInstalada(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

function pushSoportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function mismaClave(sub: PushSubscription): boolean {
  const actual = sub.options?.applicationServerKey;
  if (!actual) return true; // el navegador no la expone: se asume la misma
  const esperada = claveABytes(CLAVE_VAPID);
  const bytes = new Uint8Array(actual);
  return bytes.length === esperada.length && bytes.every((b, i) => b === esperada[i]);
}

/** Registro del service worker del panel, o null si no hay (o tarda demasiado). */
async function registroSW(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSoportado()) return null;
  const existente = await navigator.serviceWorker.getRegistration(SCOPE).catch(() => undefined);
  if (existente?.active) return existente;
  // Recién registrado (primera visita): esperar a que se active, con tope.
  const listo = navigator.serviceWorker.ready.then((r) => (r.scope.endsWith(SCOPE) ? r : null));
  const tope = new Promise<null>((r) => setTimeout(() => r(null), ESPERA_SW_MS));
  return (await Promise.race([listo, tope]).catch(() => null)) ?? existente ?? null;
}

/** Estado de las notificaciones en este equipo (no pide permiso ni cambia nada). */
export async function detectarEstadoPush(): Promise<EstadoPush> {
  const noDisponible = estadoInmediato();
  if (noDisponible) return noDisponible;
  const reg = await registroSW();
  if (!reg) return "sin-service-worker";
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  return sub && Notification.permission === "granted" ? "activadas" : "desactivadas";
}

/** Lo que se puede saber sin esperar nada (para no gastar la activación del clic). */
function estadoInmediato(): EstadoPush | null {
  if (esIOS() && !esAppInstalada()) return "instalar-ios";
  if (!pushSoportado()) return "no-soportado";
  if (!CLAVE_VAPID) return "sin-configurar";
  if (Notification.permission === "denied") return "bloqueadas";
  return null;
}

/**
 * Pide permiso (debe llamarse desde un clic), suscribe y guarda en el servidor.
 * Devuelve el estado final y, si algo falló, el mensaje para la persona.
 *
 * requestPermission() va ANTES de cualquier await: Safari (iOS) y Firefox solo
 * muestran el diálogo dentro de la activación del clic; tras esperar al service
 * worker o a getSubscription() lo ignoran o lo dan por denegado.
 */
export async function activarPush(): Promise<{ estado: EstadoPush; error?: string }> {
  const noDisponible = estadoInmediato();
  if (noDisponible) return { estado: noDisponible };

  const permiso = await Notification.requestPermission();
  if (permiso === "denied") return { estado: "bloqueadas" };
  if (permiso !== "granted") return { estado: "desactivadas" }; // cerró el diálogo sin elegir

  const reg = await registroSW();
  if (!reg) return { estado: "sin-service-worker" };
  try {
    let sub = await reg.pushManager.getSubscription();
    if (sub && !mismaClave(sub)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(CLAVE_VAPID) });
    const r = await guardarSuscripcionPush(sub.toJSON(), navigator.userAgent);
    if (!r.success) {
      // Sin la fila en el servidor no llegaría nada: se deshace para no mostrar "activadas".
      await sub.unsubscribe().catch(() => undefined);
      return { estado: "desactivadas", error: r.error };
    }
    return { estado: "activadas" };
  } catch {
    return {
      estado: "desactivadas",
      error: "El navegador no pudo activar las notificaciones. Revisa tu conexión e intenta de nuevo.",
    };
  }
}

/** Quita la suscripción de este navegador (servidor y navegador). */
export async function desactivarPush(): Promise<{ estado: EstadoPush; error?: string }> {
  const reg = await registroSW();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (!sub) return { estado: await detectarEstadoPush() };
  const r = await eliminarSuscripcionPush(sub.endpoint);
  await sub.unsubscribe().catch(() => undefined);
  if (!r.success) return { estado: "desactivadas", error: r.error };
  return { estado: "desactivadas" };
}

/**
 * Para cerrar sesión: este equipo deja de recibir los avisos de la cuenta.
 * Nunca lanza ni tarda más de unos segundos.
 */
export async function olvidarPushDeEsteEquipo(): Promise<void> {
  try {
    await Promise.race([desactivarPush(), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    // Si falla, la siguiente sesión en este navegador se queda con la suscripción (fn_guardar_push_panel).
  }
}

/**
 * Al abrir el panel: si este navegador ya tiene permiso y suscripción, la vuelve a
 * guardar para la sesión actual (otra persona pudo entrar en el mismo equipo, el
 * navegador pudo renovarla o la clave VAPID pudo cambiar). Silencioso.
 */
export async function sincronizarPush(reg: ServiceWorkerRegistration): Promise<void> {
  if (!CLAVE_VAPID || !("PushManager" in window) || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    if (!mismaClave(sub)) {
      await sub.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(CLAVE_VAPID) });
    }
    await guardarSuscripcionPush(sub.toJSON(), navigator.userAgent);
  } catch {
    // Sin red o sin sesión: se intenta en la próxima apertura.
  }
}

/** Muestra un aviso local (sin pasar por el servidor) para comprobar cómo se ve. */
export async function probarAvisoLocal(): Promise<boolean> {
  const reg = await registroSW();
  if (!reg || Notification.permission !== "granted") return false;
  await reg.showNotification("Notificación de prueba", {
    body: "Así te avisaremos cuando un cliente reporte un pago por verificar.",
    icon: ICONO,
    badge: ICONO,
    tag: "enbus-prueba",
    data: { url: "/cooperativas/pagos", pagos: [] },
  });
  return true;
}
