export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/cached";
import LoginPageClient from "./login-client";

// Mensajes para los códigos de ?error= (layout del panel y /cooperativas/auth/callback).
const ERRORES: Record<string, string> = {
  "sin-acceso":
    "No pudimos abrir el panel con esta cuenta. Si trabajas en una cooperativa, inicia sesión de nuevo; si sigue pasando, pide al administrador de tu cooperativa que te invite.",
  "auth-callback-failed": "El enlace venció o ya fue usado. Pide uno nuevo o inicia sesión con tu correo.",
};

interface PageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const codigo = Array.isArray(params.error) ? params.error[0] : params.error;

  // Con una sesión que sí tiene acceso al panel se entra directo (antes lo hacía el
  // proxy sin mirar el rol, lo que creaba un bucle con cuentas sin acceso).
  if (!codigo) {
    const user = await getUserProfile();
    if (user?.cooperativa_id && (user.role === "admin_cooperativa" || user.role === "taquillero")) {
      redirect(user.role === "taquillero" ? "/cooperativas/taquilla/encomiendas" : "/cooperativas/dashboard");
    }
  }

  const errorInicial = codigo ? ERRORES[codigo] ?? ERRORES["auth-callback-failed"] : null;
  return <LoginPageClient errorInicial={errorInicial} />;
}
