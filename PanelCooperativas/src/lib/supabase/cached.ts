import { cache } from "react";
import { createClient } from "./server";
import type { UserProfile } from "@/hooks/use-user";

// React cache() deduplicates within a single server render pass.
// Layout + Page calling getUserProfile() = only 1 actual fetch.

// La sucursal se embebe por la FK `profiles.sucursal_id` (fase 2); el alias evita choques de nombre.
const SELECT_PERFIL =
  "id, role, nombre_completo, cooperativa_id, sucursal_id, cooperativas(nombre, estado, motivo_estado, estado_cambiado_at), sucursal:sucursales!sucursal_id(nombre)";
// Respaldo mientras la base no tenga las columnas de la fase 3 (migración 20260720000002)
// o la relación con sucursales no esté en el caché de esquema de PostgREST.
const SELECT_PERFIL_BASICO = "id, role, nombre_completo, cooperativa_id, cooperativas(nombre, estado)";

type SucursalEmbed = { nombre?: string | null } | null;

type CooperativaEmbed = {
  nombre?: string | null;
  estado?: string | null;
  motivo_estado?: string | null;
  estado_cambiado_at?: string | null;
} | null;

export const getUserProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createClient();
  // Use getSession (reads JWT from cookie, NO network call)
  // Safe because middleware already validated with getUser()
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  let { data: profile, error } = await supabase
    .from("profiles")
    .select(SELECT_PERFIL)
    .eq("id", session.user.id)
    .single();

  // 42703 = columna inexistente (migración sin aplicar); PGRST200/PGRST201 = relación no encontrada o ambigua.
  if (error?.code === "42703" || error?.code === "PGRST200" || error?.code === "PGRST201") {
    ({ data: profile, error } = await supabase
      .from("profiles")
      .select(SELECT_PERFIL_BASICO)
      .eq("id", session.user.id)
      .single());
  }

  if (!profile) return null;

  // PostgREST puede devolver el embed como objeto o como arreglo.
  const embed = profile.cooperativas as unknown;
  const coop = (Array.isArray(embed) ? embed[0] : embed) as CooperativaEmbed;
  const embedSucursal = (profile as { sucursal?: unknown }).sucursal;
  const sucursal = (Array.isArray(embedSucursal) ? embedSucursal[0] : embedSucursal) as SucursalEmbed | undefined;

  return {
    id: profile.id,
    role: profile.role as UserProfile["role"],
    nombre_completo: profile.nombre_completo,
    cooperativa_id: profile.cooperativa_id ?? null,
    cooperativa_nombre: coop?.nombre ?? null,
    cooperativa_estado: coop?.estado ?? null,
    cooperativa_motivo_estado: coop?.motivo_estado ?? null,
    cooperativa_estado_cambiado_at: coop?.estado_cambiado_at ?? null,
    sucursal_nombre: sucursal?.nombre ?? null,
  };
});
