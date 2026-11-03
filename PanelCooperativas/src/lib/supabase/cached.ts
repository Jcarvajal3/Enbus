import { cache } from "react";
import { createClient } from "./server";
import type { UserProfile } from "@/hooks/use-user";

// React cache() deduplicates within a single server render pass.
// Layout + Page calling getUserProfile() = only 1 actual fetch.

const SELECT_PERFIL =
  "id, role, nombre_completo, cooperativa_id, cooperativas(nombre, estado, motivo_estado, estado_cambiado_at)";
// Respaldo mientras la base no tenga las columnas de la fase 3 (migración 20260720000002).
const SELECT_PERFIL_BASICO = "id, role, nombre_completo, cooperativa_id, cooperativas(nombre, estado)";

type CooperativaEmbed = {
  nombre?: string | null;
  estado?: string | null;
  motivo_estado?: string | null;
  estado_cambiado_at?: string | null;
} | null;

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

  // 42703 = columna inexistente: la migración de la fase 3 aún no se aplicó.
  if (error?.code === "42703") {
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

  return {
    id: profile.id,
    role: profile.role as UserProfile["role"],
    nombre_completo: profile.nombre_completo,
    cooperativa_id: profile.cooperativa_id ?? null,
    cooperativa_nombre: coop?.nombre ?? null,
    cooperativa_estado: coop?.estado ?? null,
    cooperativa_motivo_estado: coop?.motivo_estado ?? null,
    cooperativa_estado_cambiado_at: coop?.estado_cambiado_at ?? null,
  };
});
