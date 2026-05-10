import { cache } from "react";
import { createClient } from "./server";

// React cache() deduplicates within a single server render pass.
// Layout + Page calling getUserProfile() = only 1 actual fetch.

export const getUserProfile = cache(async () => {
  const supabase = await createClient();
  // Use getSession (reads JWT from cookie, NO network call)
  // Safe because middleware already validated with getUser()
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, nombre_completo, cooperativa_id, cooperativas(nombre)")
    .eq("id", session.user.id)
    .single();

  if (!profile) return null;

  return {
    id: profile.id,
    role: profile.role as "taquillero" | "admin_cooperativa",
    nombre_completo: profile.nombre_completo,
    cooperativa_id: profile.cooperativa_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cooperativa_nombre: (profile.cooperativas as any)?.nombre,
  };
});
