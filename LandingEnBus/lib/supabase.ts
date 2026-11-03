import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente con service role: SOLO en el servidor (server components y server actions).
// No lanza al importarse: si faltan las variables, `obtenerSupabaseAdmin()` devuelve
// null y cada sección decide qué ocultar (la landing no se cae por falta de configuración).

let cliente: SupabaseClient | null | undefined;

/** Cliente admin de Supabase, o null si faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. */
export function obtenerSupabaseAdmin(): SupabaseClient | null {
  if (cliente !== undefined) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  cliente =
    url && serviceKey
      ? createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  return cliente;
}

/**
 * Compatibilidad con `registro-cooperativa`: mismo cliente admin, pero se resuelve al
 * usarse. Si falta la configuración, el primer acceso lanza (dentro del try/catch de la
 * acción que lo use), nunca al importar el módulo.
 * En código nuevo, usar `obtenerSupabaseAdmin()` y manejar el null.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_destino, propiedad) {
    const real = obtenerSupabaseAdmin();
    if (!real) {
      throw new Error(
        "Supabase no está configurado: faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    const valor = Reflect.get(real, propiedad, real);
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
});
