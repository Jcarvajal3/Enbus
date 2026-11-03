export const dynamic = "force-dynamic";

import AdminLoginClient from "./login-client";

// Mensajes para los códigos que devuelve /admin/auth/callback en ?error=
const ERRORES_CALLBACK: Record<string, string> = {
  "access-denied": "Esta cuenta no es de administrador de EnBus. Entra con una cuenta de administrador o usa el panel de tu cooperativa.",
  "auth-callback-failed": "No pudimos iniciar sesión con Google. Intenta de nuevo o usa tu correo.",
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const errorInicial = params.error ? ERRORES_CALLBACK[params.error] ?? ERRORES_CALLBACK["auth-callback-failed"] : null;

  return <AdminLoginClient errorInicial={errorInicial} />;
}
