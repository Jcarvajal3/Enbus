export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/cached";
import { INICIO } from "@/lib/navigation";
import { INICIO_ADMIN } from "@/lib/admin-navigation";
import LoginPageClient, { type AvisoLogin } from "./login-client";

export const metadata: Metadata = { title: "Iniciar sesión" };

interface PageProps {
  searchParams: Promise<{ error?: string | string[]; motivo?: string | string[] }>;
}

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const motivo = primero(params.motivo);
  const error = primero(params.error);

  // `?motivo=sin-acceso` (o `?error=sin-acceso`): el layout del panel devolvió una
  // sesión sin rol de cooperativa; el cliente la cierra y lo explica (sin volver a
  // redirigir). `?error=…` (otro código): el enlace del correo venció o ya se usó.
  const aviso: AvisoLogin | null =
    motivo || error === "sin-acceso" ? "sin-acceso" : error ? "enlace-vencido" : null;

  // El proxy no redirige el login con sesión (con una cuenta sin acceso eso era un
  // bucle login → panel → login): lo decide aquí el perfil verificado. Una sesión con
  // acceso entra directo a su inicio; el super admin, al suyo (§2.1 regla 7).
  if (!aviso) {
    const user = await getUserProfile();
    if (user?.role === "super_admin") redirect(INICIO_ADMIN);
    if (user?.cooperativa_id && (user.role === "admin_cooperativa" || user.role === "taquillero")) {
      redirect(INICIO);
    }
  }

  return <LoginPageClient aviso={aviso} />;
}
