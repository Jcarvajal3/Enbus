"use server";

// ─── Notificaciones push de este equipo ─────────────────────────────────────
// La suscripción del navegador (pushManager.subscribe) se guarda con la RPC
// fn_guardar_push_panel: valida que sea personal activo de una cooperativa y,
// si el navegador lo usaba otra persona, lo pasa a la sesión actual. Las
// suscripciones se borran por RLS (cada usuario solo las suyas). El envío lo
// hace la edge function push-panel (migración 20261109000004).

import { createClient } from "@/lib/supabase/server";
import { codigoEB, humanizeError } from "@/lib/errores";

export type ResultadoPush = { success: true } | { success: false; error: string; codigo?: string };

/** Lo que entrega PushSubscription.toJSON(). */
export type SuscripcionNavegador = {
  endpoint?: string | null;
  keys?: { p256dh?: string | null; auth?: string | null } | null;
};

const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const MSG_INVALIDA = "Este navegador no entregó una suscripción válida. Usa Chrome, Edge, Firefox o Safari actualizados.";

function limpiarClave(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/=+$/, "");
}

/** Guarda (o renueva) la suscripción de este navegador para la sesión actual. */
export async function guardarSuscripcionPush(
  sub: SuscripcionNavegador,
  userAgent?: string | null
): Promise<ResultadoPush> {
  const endpoint = (sub?.endpoint ?? "").trim();
  const p256dh = limpiarClave(sub?.keys?.p256dh);
  const auth = limpiarClave(sub?.keys?.auth);
  if (
    !endpoint.startsWith("https://") ||
    endpoint.length > 1024 ||
    !B64URL_RE.test(p256dh) ||
    !B64URL_RE.test(auth)
  ) {
    return { success: false, error: MSG_INVALIDA, codigo: "EB_DATOS_INVALIDOS" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_guardar_push_panel", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: (userAgent ?? "").slice(0, 300) || null,
  });
  if (error) {
    return {
      success: false,
      error: humanizeError(error, "activar las notificaciones"),
      codigo: codigoEB(error) ?? undefined,
    };
  }
  return { success: true };
}

/** Quita la suscripción de este navegador (solo si es de la sesión actual; RLS). */
export async function eliminarSuscripcionPush(endpoint: string): Promise<ResultadoPush> {
  const limpio = (endpoint ?? "").trim();
  if (!limpio) return { success: true };
  const supabase = await createClient();
  const { error } = await supabase.from("panel_push_suscripciones").delete().eq("endpoint", limpio);
  if (error) {
    return { success: false, error: humanizeError(error, "desactivar las notificaciones") };
  }
  return { success: true };
}
