import { NextResponse } from "next/server";
import { resolverOrigenPublico } from "@/lib/auth/origen-publico";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Sanitize the `next` redirect param to prevent open redirect attacks.
 * Only internal absolute paths are allowed (must start with `/` but NOT `//`).
 */
function sanitizeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  // Solo rutas del panel de cooperativas. Los navegadores tratan la barra invertida como "/".
  if (raw.includes("\\") || raw.startsWith("//")) return fallback;
  if (raw === "/cooperativas" || raw.startsWith("/cooperativas/")) return raw;
  return fallback;
}

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const origin = resolverOrigenPublico(request, requestOrigin);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  // Flujo de recuperación de contraseña por correo
  if (rawNext?.startsWith("/cooperativas/restablecer")) {
    const next = sanitizeNext(rawNext, "/cooperativas/restablecer");
    if (code) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
    return NextResponse.redirect(`${origin}/cooperativas/login?error=auth-callback-failed`);
  }

  // Flujos OAuth (registro o login con Google)
  const esRegistro = rawNext?.startsWith("/cooperativas/registro") ?? false;
  const falloOAuthUrl = `${origin}${esRegistro ? "/cooperativas/registro?error=google" : "/cooperativas/login?error=google"}`;

  if (!code) {
    return NextResponse.redirect(falloOAuthUrl);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(falloOAuthUrl);
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, cooperativa_id, eliminada_at")
    .eq("id", data.session.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[cooperativas/auth/callback] perfil:", profileError);
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(falloOAuthUrl);
  }

  if (profile?.eliminada_at) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(`${origin}/cooperativas/login?motivo=sin-acceso`);
  }

  if (profile?.role === "super_admin") {
    return NextResponse.redirect(`${origin}/admin/dashboard`);
  }

  if ((profile?.role === "admin_cooperativa" || profile?.role === "taquillero") && profile?.cooperativa_id) {
    const candidato = sanitizeNext(rawNext, "/cooperativas/dashboard");
    const destino =
      candidato.startsWith("/cooperativas/registro") ||
      candidato.startsWith("/cooperativas/login") ||
      candidato.startsWith("/cooperativas/auth")
        ? "/cooperativas/dashboard"
        : candidato;
    return NextResponse.redirect(`${origin}${destino}`);
  }

  if (esRegistro || profile?.role === "admin_cooperativa") {
    if (!profile) {
      const { error: upsertError } = await admin.from("profiles").upsert({
        id: data.session.user.id,
        role: "admin_cooperativa",
        cooperativa_id: null,
        nombre_completo: (data.session.user.user_metadata?.full_name as string | undefined)?.trim() || "Administrador",
        telefono: `PENDIENTE-${data.session.user.id}`,
        cedula_rif: `PENDIENTE-${data.session.user.id}`,
      });
      if (upsertError) {
        console.error("[cooperativas/auth/callback] upsert perfil:", upsertError);
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.redirect(falloOAuthUrl);
      }
    } else if (profile.role !== "admin_cooperativa") {
      const { error: updateError } = await admin
        .from("profiles")
        .update({ role: "admin_cooperativa" })
        .eq("id", data.session.user.id);
      if (updateError) {
        console.error("[cooperativas/auth/callback] update perfil:", updateError);
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.redirect(falloOAuthUrl);
      }
    }
    return NextResponse.redirect(`${origin}/cooperativas/registro`);
  }

  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(`${origin}/cooperativas/login?motivo=sin-acceso`);
}
