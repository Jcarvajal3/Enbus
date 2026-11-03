// ─── Límite de frecuencia del registro público (fase 4, §1 y §6) ─────────────
// Solo servidor (lo importan las server actions de ./actions.ts). Usa
// `fn_consumir_limite` (migración 20260721000003, solo service role), atómica en
// SQL. La IP nunca se guarda: la clave lleva un HMAC-SHA256 de la IP con un
// secreto del servidor.
//
//   verificarCorreoRegistro: 10 cada 10 minutos por IP
//   registrarCooperativa:     5 cada hora por IP

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import type { ResultadoLimite } from "@/lib/types/operacion";

export const LIMITE_VERIFICAR_CORREO = { prefijo: "correo", maximo: 10, ventanaSegundos: 10 * 60 } as const;
export const LIMITE_REGISTRO = { prefijo: "registro", maximo: 5, ventanaSegundos: 60 * 60 } as const;

type Limite = { prefijo: string; maximo: number; ventanaSegundos: number };

export type ConsumoLimite = { permitido: true } | { permitido: false; reintentarEnSegundos: number };

let avisoSinRpc = false;

/** Hash de la IP de quien llama (32 caracteres hex), o null si no se conoce. */
async function hashIpCliente(): Promise<string | null> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  const secreto = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ip || !secreto) return null;
  return createHmac("sha256", secreto).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Consume una unidad del límite para la IP de quien llama. Ante un fallo técnico
 * (sin IP, sin la RPC, error de red) no bloquea: el registro sigue funcionando y
 * el problema queda en el log del servidor.
 */
export async function consumirLimitePorIp(limite: Limite): Promise<ConsumoLimite> {
  const ip = await hashIpCliente();
  if (!ip) return { permitido: true };

  const { data, error } = await createAdminClient().rpc("fn_consumir_limite", {
    p_clave: `${limite.prefijo}:${ip}`,
    p_maximo: limite.maximo,
    p_ventana_segundos: limite.ventanaSegundos,
  });
  if (error) {
    // 42883 / PGRST202: la función no existe (migración 20260721000003 sin aplicar).
    const sinRpc = error.code === "42883" || error.code === "PGRST202";
    if (!sinRpc || !avisoSinRpc) {
      if (sinRpc) avisoSinRpc = true;
      console.warn(
        sinRpc
          ? "[registro] fn_consumir_limite no existe (aplica la migración 20260721000003). Se sigue sin límite."
          : "[registro] No se pudo consultar el límite de frecuencia; se permite el intento.",
        sinRpc ? "" : error
      );
    }
    return { permitido: true };
  }
  const r = (data ?? {}) as Partial<ResultadoLimite>;
  if (r.permitido === false) {
    return { permitido: false, reintentarEnSegundos: Math.max(1, Number(r.reintentar_en_segundos) || 60) };
  }
  return { permitido: true };
}
