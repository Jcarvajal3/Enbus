export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import AdminLoginClient, { type AvisoLoginAdmin } from "./login-client";

export const metadata: Metadata = { title: "Iniciar sesión" };

interface PageProps {
  searchParams: Promise<{ error?: string; motivo?: string }>;
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { error, motivo } = await searchParams;
  // `?motivo=sin-acceso`: el layout del admin devolvió una sesión sin rol de
  // administrador; el cliente la cierra y lo explica (sin volver a redirigir).
  // `?error=…`: códigos de /admin/auth/callback (Google).
  const aviso: AvisoLoginAdmin | null =
    motivo || error === "access-denied" ? "sin-acceso" : error ? "google" : null;
  return <AdminLoginClient aviso={aviso} />;
}
