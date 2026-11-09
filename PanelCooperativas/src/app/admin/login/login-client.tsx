"use client";

// ─── Login del admin (SY-05, AD5-44) ────────────────────────────────────────
// Mismo marco que el de cooperativas (`AuthLayout`). Orden de foco: correo →
// contraseña → Entrar; "¿Olvidaste tu contraseña?" va al pie.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GoogleLogo, WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { humanizeError, MSG } from "@/lib/errores";
import { INICIO } from "@/lib/navigation";
import { INICIO_ADMIN } from "@/lib/admin-navigation";

export type AvisoLoginAdmin = "sin-acceso" | "google";

const ENLACE = "font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline";

type ErrorLogin = { titulo: string; detalle?: string };

const SIN_ACCESO: ErrorLogin = {
  titulo: "Esta cuenta no es de administrador",
  detalle: "Entra con una cuenta de Administrador EnBus.",
};
const ERROR_GOOGLE: ErrorLogin = {
  titulo: "No pudiste entrar con Google",
  detalle: "Intenta de nuevo o usa tu correo.",
};

export default function AdminLoginClient({ aviso }: { aviso: AvisoLoginAdmin | null }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<ErrorLogin | null>(() =>
    aviso === "sin-acceso" ? SIN_ACCESO : aviso === "google" ? ERROR_GOOGLE : null
  );
  const ocupado = loading || googleLoading;

  // PN-01: el layout trajo aquí una sesión sin acceso al admin. Se cierra solo en
  // este navegador y el login ya no redirige, así que no hay bucle.
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
    if (ocupado) return;
    setLoading(true);
    setError(null);

    try {
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
        return fallar({ titulo: "No pudiste entrar", detalle: humanizeError(profileError, "verificar tu cuenta") }, true);
      }

      // Con cuenta de otra zona, a su inicio (§2.1 regla 7).
      if ((profile.role === "taquillero" || profile.role === "admin_cooperativa") && profile.cooperativa_id) {
        router.replace(INICIO);
        return;
      }
      if (profile.role !== "super_admin") return fallar(SIN_ACCESO, true);

      router.replace(INICIO_ADMIN);
      router.refresh();
    } catch (err) {
      fallar({ titulo: "No pudiste entrar", detalle: humanizeError(err, "iniciar sesión") });
    }
  };

  const handleGoogleSignIn = async () => {
    if (ocupado) return;
    setGoogleLoading(true);
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/admin/auth/callback` },
      });
      if (oauthError) {
        setError(ERROR_GOOGLE);
        setGoogleLoading(false);
      }
    } catch {
      setError(ERROR_GOOGLE);
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      zona="admin"
      titulo="Iniciar sesión"
      descripcion="Acceso para el equipo de administración de EnBus."
      pie={
        <Link href="/cooperativas/recuperar" className={ENLACE}>
          ¿Olvidaste tu contraseña?
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        {error && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>{error.titulo}</AlertTitle>
            {error.detalle && <AlertDescription>{error.detalle}</AlertDescription>}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <Input
                id="email"
                type="email"
                inputMode="email"
                placeholder="tu@correo.com"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={ocupado}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <PasswordInput
                id="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={ocupado}
              />
            </Field>
          </FieldGroup>

          <Button type="submit" className="w-full" disabled={ocupado} aria-busy={loading || undefined}>
            {loading && <Spinner size="sm" aria-hidden />}
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <div className="flex items-center gap-2" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="px-2 text-xs text-muted-foreground">o</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={ocupado}
          aria-busy={googleLoading || undefined}
          className="w-full"
        >
          {googleLoading ? <Spinner size="sm" aria-hidden /> : <GoogleLogo aria-hidden />}
          Continuar con Google
        </Button>
      </div>
    </AuthLayout>
  );
}
