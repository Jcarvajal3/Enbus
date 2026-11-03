export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import LoginPageClient, { type AvisoLogin } from "./login-client";

export const metadata: Metadata = { title: "Iniciar sesión" };

interface PageProps {
  searchParams: Promise<{ error?: string; motivo?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { error, motivo } = await searchParams;
  // `?motivo=sin-acceso`: el layout del panel devolvió una sesión sin rol de
  // cooperativa; el cliente la cierra y lo explica (sin volver a redirigir).
  // `?error=…`: el enlace del correo (recuperación) venció o ya se usó.
  const aviso: AvisoLogin | null = motivo ? "sin-acceso" : error ? "enlace-vencido" : null;
  return <LoginPageClient aviso={aviso} />;
}
