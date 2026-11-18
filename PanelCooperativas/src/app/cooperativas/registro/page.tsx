export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INICIO } from "@/lib/navigation";
import { INICIO_ADMIN } from "@/lib/admin-navigation";
import RegistroCooperativaClient from "./registro-client";

interface PageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function limpiarNombreSugerido(candidatos: unknown[], email: string | undefined): string | null {
  const prefijo = (email ?? "").split("@")[0]?.trim().toLowerCase() ?? "";
  for (const raw of candidatos) {
    if (typeof raw !== "string") continue;
    const limpio = raw.trim().replace(/\s+/g, " ");
    if (!limpio) continue;
    const lower = limpio.toLowerCase();
    if (lower === "usuario enbus" || lower === "administrador") continue;
    if (prefijo && lower === prefijo) continue;
    return limpio;
  }
  return null;
}

export default async function RegistroCooperativaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const avisoInicial = primero(params.error) === "google" ? "google" : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, cooperativa_id, nombre_completo, eliminada_at")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.eliminada_at) {
      if (profile?.role === "super_admin") redirect(INICIO_ADMIN);

      if ((profile?.role === "admin_cooperativa" || profile?.role === "taquillero") && profile?.cooperativa_id) {
        redirect(INICIO);
      }

      if (!profile || profile.role === "admin_cooperativa" || profile.role === "user") {
        const nombreSugerido = limpiarNombreSugerido(
          [profile?.nombre_completo, user.user_metadata?.full_name, user.user_metadata?.name],
          user.email
        );

        return (
          <RegistroCooperativaClient
            sesionInicial={{ email: user.email ?? "", nombreSugerido }}
            avisoInicial={avisoInicial}
          />
        );
      }
    }
  }

  return <RegistroCooperativaClient sesionInicial={null} avisoInicial={avisoInicial} />;
}
