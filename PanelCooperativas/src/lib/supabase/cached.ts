import { cache } from "react";
import { createClient } from "./server";
import { leerCooperativasPrivadas } from "./cooperativas-privadas";
import type { UserProfile } from "@/hooks/use-user";

// React cache() deduplicates within a single server render pass.
// Layout + Page calling getUserProfile() = only 1 actual fetch.

// La sucursal se embebe por la FK `profiles.sucursal_id` (fase 2); el alias evita choques de nombre.
// De la cooperativa solo se embeben columnas públicas: motivo_estado y estado_cambiado_at ya no
// son legibles en la tabla (20261109000009) y se leen aparte por la RPC, solo si hace falta.
const SELECT_PERFIL =
  "id, role, nombre_completo, cooperativa_id, sucursal_id, cooperativas(nombre, estado), sucursal:sucursales!sucursal_id(nombre)";
// Respaldo mientras la base no tenga la columna sucursal_id (fase 2) o la relación con
// sucursales no esté en el caché de esquema de PostgREST.
const SELECT_PERFIL_BASICO = "id, role, nombre_completo, cooperativa_id, cooperativas(nombre, estado)";

type SucursalEmbed = { nombre?: string | null } | null;

type CooperativaEmbed = {
  nombre?: string | null;
  estado?: string | null;
} | null;

type EstadoCooperativa = { motivo_estado: string | null; estado_cambiado_at: string | null };

/**
 * Motivo y fecha del último cambio de estado de la cooperativa del usuario (el banner los
 * muestra cuando no está ACTIVA). Si falla, el banner sale sin motivo: no se bloquea el panel.
 */
async function leerEstadoCooperativa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cooperativaId: string
): Promise<EstadoCooperativa | null> {
  const { data, error } = await leerCooperativasPrivadas(supabase, (cooperativas) =>
    cooperativas.select("motivo_estado, estado_cambiado_at").eq("id", cooperativaId).maybeSingle()
  );
  // 42703: base sin las columnas de la fase 3 (migración 20260720000002).
  if (error && error.code !== "42703") {
    console.error("[getUserProfile] No se pudo leer el estado de la cooperativa:", error.code, error.message);
  }
  return (data as EstadoCooperativa | null) ?? null;
}

export const getUserProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createClient();
  // getClaims() verifica la firma del JWT de la cookie con las claves públicas del
  // proyecto (sin llamada de red: JWKS en caché). getSession() no la verifica.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsError ? null : claimsData?.claims?.sub;
  if (typeof userId !== "string" || !userId) return null;

  let { data: profile, error } = await supabase
    .from("profiles")
    .select(SELECT_PERFIL)
    .eq("id", userId)
    .single();

  // 42703 = columna inexistente (migración sin aplicar); PGRST200/PGRST201 = relación no encontrada o ambigua.
  if (error?.code === "42703" || error?.code === "PGRST200" || error?.code === "PGRST201") {
    ({ data: profile, error } = await supabase
      .from("profiles")
      .select(SELECT_PERFIL_BASICO)
      .eq("id", userId)
      .single());
  }

  // PGRST116 = no hay fila (cuenta sin perfil): sin acceso. Cualquier otro error
  // (red, base caída, JWT rechazado por PostgREST) se registra y también deja sin
  // acceso, pero se distingue en el log para no confundirlo con "no autenticado".
  if (error && error.code !== "PGRST116") {
    console.error("[getUserProfile] No se pudo leer el perfil:", error.code, error.message);
  }
  if (!profile) return null;

  // PostgREST puede devolver el embed como objeto o como arreglo.
  const embed = profile.cooperativas as unknown;
  const coop = (Array.isArray(embed) ? embed[0] : embed) as CooperativaEmbed;
  const embedSucursal = (profile as { sucursal?: unknown }).sucursal;
  const sucursal = (Array.isArray(embedSucursal) ? embedSucursal[0] : embedSucursal) as SucursalEmbed | undefined;
  const estadoCoop =
    profile.cooperativa_id && coop?.estado && coop.estado !== "ACTIVA"
      ? await leerEstadoCooperativa(supabase, profile.cooperativa_id)
      : null;

  return {
    id: profile.id,
    role: profile.role as UserProfile["role"],
    nombre_completo: profile.nombre_completo,
    cooperativa_id: profile.cooperativa_id ?? null,
    cooperativa_nombre: coop?.nombre ?? null,
    cooperativa_estado: coop?.estado ?? null,
    cooperativa_motivo_estado: estadoCoop?.motivo_estado ?? null,
    cooperativa_estado_cambiado_at: estadoCoop?.estado_cambiado_at ?? null,
    sucursal_nombre: sucursal?.nombre ?? null,
  };
});
