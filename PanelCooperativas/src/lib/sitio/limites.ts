// ─── Límites de frecuencia de las acciones públicas del sitio (SOLO SERVIDOR) ─
// Usa `fn_consumir_limite` (migración 20260721000003, solo service role): cuenta y
// decide en una sola sentencia SQL, así dos peticiones simultáneas no pasan las dos.
// La IP nunca se guarda: la clave lleva un HMAC-SHA256 de la IP con un secreto del
// servidor. Importar solo desde server actions y server components.

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResultadoLimite = { permitido: true } | { permitido: false; reintentarEnSegundos: number };

let avisoSinRpc = false;

/** Consume una unidad del límite `clave` (atómico en SQL). Ante un fallo técnico no bloquea. */
async function consumirLimite(
  supabase: SupabaseClient,
  clave: string,
  maximo: number,
  ventanaSegundos: number
): Promise<ResultadoLimite> {
  try {
    const { data, error } = await supabase.rpc("fn_consumir_limite", {
      p_clave: clave,
      p_maximo: maximo,
      p_ventana_segundos: ventanaSegundos,
    });
    if (error) {
      if (error.code === "42883" || error.code === "PGRST202") {
        if (!avisoSinRpc) {
          avisoSinRpc = true;
          console.warn("fn_consumir_limite no existe (aplica la migración 20260721000003). Se sigue sin límite.");
        }
        return { permitido: true };
      }
      console.warn("No se pudo consultar el límite de frecuencia; se permite el intento.", error.message);
      return { permitido: true };
    }
    const r = (data ?? {}) as { permitido?: boolean; reintentar_en_segundos?: number };
    if (r.permitido === false) {
      return { permitido: false, reintentarEnSegundos: Math.max(1, Number(r.reintentar_en_segundos) || 60) };
    }
    return { permitido: true };
  } catch (err) {
    console.warn("No se pudo consultar el límite de frecuencia; se permite el intento.", err);
    return { permitido: true };
  }
}

/**
 * Hash (HMAC-SHA256 con un secreto del servidor) de la IP de quien llama, o null si no se conoce.
 * Primero `x-real-ip` (lo pone el proxy de Vercel y el cliente no puede fijarlo) y, si no
 * está, la primera IP de `x-forwarded-for`.
 */
async function hashIpCliente(): Promise<string | null> {
  const h = await headers();
  const ip = (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "").trim().slice(0, 64);
  const secreto = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ip || !secreto) return null;
  return createHmac("sha256", secreto).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

/** Consume una unidad del límite `prefijo` para la IP de quien llama (sin IP conocida, no limita). */
export async function consumirLimitePorIp(
  supabase: SupabaseClient,
  prefijo: string,
  maximo: number,
  ventanaSegundos: number
): Promise<ResultadoLimite> {
  const ip = await hashIpCliente();
  if (!ip) return { permitido: true };
  return consumirLimite(supabase, `${prefijo}:${ip}`, maximo, ventanaSegundos);
}

/** 61 → "2 minutos"; 30 → "1 minuto". */
export function minutosTexto(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
}

/** Texto de un argumento de server action: solo cadenas (el cliente puede mandar cualquier valor), recortado. */
export function textoEntrada(valor: unknown, maximo: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}
