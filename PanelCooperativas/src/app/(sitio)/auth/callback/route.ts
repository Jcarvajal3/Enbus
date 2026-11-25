import { NextResponse } from "next/server";
import { resolverOrigenPublico } from "@/lib/auth/origen-publico";
import { nextSeguro, RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { createClient } from "@/lib/supabase/server";

// Callback de Supabase Auth para el PASAJERO: confirmación de correo, recuperación de
// contraseña y Google. El del panel vive en /cooperativas/auth/callback y no se toca.

export async function GET(request: Request) {
  const { searchParams, origin: origenSolicitud } = new URL(request.url);
  const origen = resolverOrigenPublico(request, origenSolicitud);
  const code = searchParams.get("code");
  const next = nextSeguro(searchParams.get("next"));
  const esRecuperacion = next?.split(/[?#]/)[0] === RUTAS_PASAJERO.restablecerClave;

  const fallo = (codigo: string) =>
    NextResponse.redirect(`${origen}${esRecuperacion ? RUTAS_PASAJERO.recuperarClave : RUTAS_PASAJERO.ingresar}?error=${codigo}`);

  if (!code) return fallo("enlace");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return fallo(esRecuperacion ? "enlace" : "google");

  // Un enlace de recuperación solo lleva a elegir la contraseña nueva.
  if (esRecuperacion) return NextResponse.redirect(`${origen}${next}`);

  const { data: perfil, error: errorPerfil } = await supabase
    .from("profiles")
    .select("role, eliminada_at")
    .eq("id", data.session.user.id)
    .maybeSingle();

  if (errorPerfil || !perfil || perfil.eliminada_at) {
    if (errorPerfil) console.error("[auth/callback] perfil:", errorPerfil.code, errorPerfil.message);
    await supabase.auth.signOut({ scope: "local" });
    return fallo("google");
  }

  // Cuenta del panel: no se le cambia nada; /ingresar explica y ofrece cerrar sesión.
  if (perfil.role !== "user") {
    return NextResponse.redirect(`${origen}${RUTAS_PASAJERO.ingresar}?motivo=cuenta-panel`);
  }

  return NextResponse.redirect(`${origen}${next ?? RUTAS_PASAJERO.inicio}`);
}
