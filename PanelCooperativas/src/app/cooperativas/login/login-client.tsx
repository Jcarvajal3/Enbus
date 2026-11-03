"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { humanizeError, MSG } from "@/lib/errores";
import { INICIO } from "@/lib/navigation";
import { INICIO_ADMIN } from "@/lib/admin-navigation";

export type AvisoLogin = "sin-acceso" | "enlace-vencido";

const ENLACE = "font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline";

type ErrorLogin = { titulo: string; detalle?: string; conEnlace?: boolean };

const SIN_ACCESO: ErrorLogin = {
  titulo: "Esta cuenta no tiene acceso",
  detalle: "Entra con la cuenta que te dio tu cooperativa.",
};

export default function LoginPageClient({ aviso }: { aviso: AvisoLogin | null }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorLogin | null>(() =>
    aviso === "sin-acceso"
      ? SIN_ACCESO
      : aviso === "enlace-vencido"
        ? { titulo: "El enlace venció o ya se usó", conEnlace: true }
        : null
  );

  // PN-01: el layout trajo aquí una sesión sin acceso al panel. Se cierra solo en
  // este navegador (la cuenta puede seguir abierta en la app) y el login ya no
  // redirige, así que no hay bucle.
  useEffect(() => {
    if (aviso === "sin-acceso") void supabase.auth.signOut({ scope: "local" });
  }, [aviso, supabase]);

  const fallar = async (e: ErrorLogin, cerrarSesion = false) => {
    if (cerrarSesion) await supabase.auth.signOut({ scope: "local" });
    setError(e);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      const texto = authError ? humanizeError(authError, { accion: "iniciar sesión", email }) : MSG.credenciales;
      return fallar(
        texto === MSG.credenciales
          ? { titulo: "Correo o contraseña incorrectos", detalle: "Revisa los datos o recupera tu contraseña." }
          : { titulo: "No pudiste entrar", detalle: texto }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, cooperativa_id")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      return fallar({ titulo: "No pudiste entrar", detalle: humanizeError(profileError, "cargar tu perfil") }, true);
    }

    // Con cuenta de otra zona, a su inicio (§2.1 regla 7).
    if (profile.role === "super_admin") {
      router.replace(INICIO_ADMIN);
      return;
    }

    if (profile.role !== "taquillero" && profile.role !== "admin_cooperativa") {
      return fallar(SIN_ACCESO, true);
    }

    if (!profile.cooperativa_id) {
      return fallar(
        { titulo: "Tu cuenta no tiene cooperativa", detalle: "Pide al administrador de tu cooperativa que te invite." },
        true
      );
    }

    router.replace(INICIO);
  };

  return (
    <AuthLayout
      zona="cooperativas"
      titulo="Iniciar sesión"
      pie={
        <>
          ¿No tienes cuenta?{" "}
          <Link href="/cooperativas/registro" className={ENLACE}>
            Registra tu cooperativa
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>{error.titulo}</AlertTitle>
            {(error.detalle || error.conEnlace) && (
              <AlertDescription>
                {error.detalle}
                {error.conEnlace && (
                  <Link href="/cooperativas/recuperar" className="font-medium underline underline-offset-4">
                    Pedir otro enlace
                  </Link>
                )}
              </AlertDescription>
            )}
          </Alert>
        )}

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Correo</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="tu@correo.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Link href="/cooperativas/recuperar" className={`text-sm ${ENLACE}`}>
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </Field>
        </FieldGroup>

        <Button type="submit" className="w-full" disabled={loading} aria-busy={loading || undefined}>
          {loading && <Spinner size="sm" data-icon="inline-start" />}
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
