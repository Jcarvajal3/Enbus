import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// ─── Acceso del super admin (capa de datos) ──────────────────────────────────
// Las server actions son endpoints POST públicos y los layouts no se vuelven a
// renderizar en la navegación del cliente: cada action, page y función de datos
// del panel de administración verifica aquí, en el servidor, que quien llama es
// super admin antes de leer o escribir (sobre todo donde se usa la service role).
//
// A diferencia de getUserProfile() (lee la sesión de la cookie sin verificarla),
// getClaims() valida el JWT (firma y vencimiento; con un secreto simétrico lo
// valida contra Auth) y el rol se lee del perfil de ESE usuario. React cache():
// una sola verificación por petición aunque la llamen el layout, la página y
// varias funciones de datos.

export type SuperAdmin = { id: string; nombre_completo: string };

export type AccesoAdmin =
  | { estado: "ok"; admin: SuperAdmin }
  | { estado: "sin_sesion" }
  | { estado: "sin_permiso" };

export const verificarSuperAdmin = cache(async (): Promise<AccesoAdmin> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const uid = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !uid) return { estado: "sin_sesion" };

  const { data: perfil, error: perfilError } = await supabase
    .from("profiles")
    .select("id, role, nombre_completo, eliminada_at")
    .eq("id", uid)
    .maybeSingle();
  // Un fallo técnico no es "sin permiso": se propaga (error.tsx o el catch de la action).
  if (perfilError) throw perfilError;
  if (!perfil || perfil.role !== "super_admin" || perfil.eliminada_at) return { estado: "sin_permiso" };

  return { estado: "ok", admin: { id: uid, nombre_completo: perfil.nombre_completo } };
});

/**
 * Exige un super admin verificado. Lanza un error con `code` para que
 * humanizeError lo traduzca ("Tu sesión expiró…" / "No tienes permiso…").
 */
export async function requireSuperAdmin(): Promise<SuperAdmin> {
  const acceso = await verificarSuperAdmin();
  if (acceso.estado === "sin_sesion") {
    throw Object.assign(new Error("Auth session missing"), { code: "session_not_found" });
  }
  if (acceso.estado === "sin_permiso") {
    throw Object.assign(new Error("Sin permisos de Super Administrador"), { code: "42501" });
  }
  return acceso.admin;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** true si `v` es un UUID (los ids que llegan del cliente a una action no son de fiar). */
export function esUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
