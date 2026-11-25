"use server";

import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errores";
import { cedulaParaGuardar, CEDULA_ERROR, telefonoParaGuardar, TELEFONO_ERROR } from "@/lib/ve";

export type ResultadoPerfil =
  | { ok: true }
  | { ok: false; error: string; campos?: { cedula?: string; telefono?: string } };

/**
 * Guarda la cédula y el teléfono de quien tiene la sesión (completar el perfil antes de
 * reservar asientos). Cliente de sesión: la política RLS de `profiles` limita la fila a la propia.
 */
export async function completarPerfil(entrada: { cedula: string; telefono: string }): Promise<ResultadoPerfil> {
  const cedula = cedulaParaGuardar(entrada.cedula);
  const telefono = telefonoParaGuardar(entrada.telefono);
  if (!cedula || !telefono) {
    return {
      ok: false,
      error: "Revisa los datos marcados.",
      campos: { ...(cedula ? {} : { cedula: CEDULA_ERROR }), ...(telefono ? {} : { telefono: TELEFONO_ERROR }) },
    };
  }

  const supabase = await createClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const uid = claimsError ? null : data?.claims?.sub;
  if (typeof uid !== "string" || !uid) {
    return { ok: false, error: "Tu sesión venció. Vuelve a ingresar para continuar." };
  }

  const { data: filas, error } = await supabase
    .from("profiles")
    .update({ cedula_rif: cedula, telefono })
    .eq("id", uid)
    .eq("role", "user")
    .select("id");

  if (error) return { ok: false, error: humanizeError(error, "guardar tus datos") };
  if (!filas?.length) return { ok: false, error: "No pudimos guardar tus datos. Intenta de nuevo." };
  return { ok: true };
}
