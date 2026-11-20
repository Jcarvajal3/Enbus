"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GoogleLogo, WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { humanizeError, MSG } from "@/lib/errores";
import { INICIO } from "@/lib/navigation";
import { INICIO_ADMIN } from "@/lib/admin-navigation";

export type AvisoLogin = "sin-acceso" | "enlace-vencido" | "google";

const ENLACE = "font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline";

type ErrorLogin = { titulo: string; detalle?: string; conEnlace?: boolean };

const SIN_ACCESO: ErrorLogin = {
  titulo: "Esta cuenta no tiene acceso",
  detalle:
    "No pudimos abrir el panel con esta cuenta. Entra con la cuenta que te dio tu cooperativa; si sigue pasando, pide al administrador de tu cooperativa que te invite.",
};

const ERROR_GOOGLE: ErrorLogin = {
  titulo: "No pudiste entrar con Google",
  detalle: "Intenta de nuevo o usa tu correo y contraseña.",
};

export default function LoginPageClient({ aviso }: { aviso: AvisoLogin | null }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<ErrorLogin | null>(() =>
    aviso === "sin-acceso"
      ? SIN_ACCESO
      : aviso === "google"
        ? ERROR_GOOGLE
        : aviso === "enlace-vencido"
          ? { titulo: "El enlace venció o ya se usó", conEnlace: true }
          : null
  );
  const ocupado = loading || googleLoading;

  // PN-01: el layout trajo aquí una sesión sin acceso al panel. Se cierra solo en
  // este navegador (la cuenta puede seguir abierta en la app) y el login ya no
  // redirige, así que no hay bucle.
  useEffect(() => {
    if (aviso === "sin-acceso") void supabase.auth.signOut({ scope: "local" });
  }, [aviso, supabase]);

  // cerrarSesion: scope "local", solo esta sesión del navegador (no cierra la de la
  // app móvil). Sin acceso al panel no se deja una sesión a medias.
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
      await iniciarSesion();
    } catch (err) {
      // Sin red o respuesta inesperada: el botón no puede quedar bloqueado.
      setError({ titulo: "No pudiste entrar", detalle: humanizeError(err, "iniciar sesión") });
      setLoading(false);
    }
  };

  const iniciarSesion = async () => {
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
      // Sin perfil no hay acceso: no se deja una sesión a medias.
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

    if (profile.role === "admin_cooperativa" && !profile.cooperativa_id) {
      router.replace("/cooperativas/registro");
      return;
    }

    if (!profile.cooperativa_id) {
      return fallar(
        { titulo: "Tu cuenta no tiene cooperativa", detalle: "Pide al administrador de tu cooperativa que te invite." },
        true
      );
    }

    router.replace(INICIO);
  };

  const handleGoogleSignIn = async () => {
    if (ocupado) return;
    setGoogleLoading(true);
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/cooperativas/auth/callback?next=/cooperativas/dashboard` },
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
      zona="cooperativas"
      titulo="Iniciar sesión"
      descripcion="Accede a la taquilla y la operación de tu cooperativa."
      pie={
        <>
          ¿No tienes cuenta?{" "}
          <Link href="/cooperativas/registro" className={ENLACE}>
            Registra tu cooperativa
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {error && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>{error.titulo}</AlertTitle>
            {(error.detalle || error.conEnlace) && (
              <AlertDescription>
                {error.detalle}
                {error.conEnlace && (
                  <>
                    {error.detalle ? " " : null}
                    <Link href="/cooperativas/recuperar" className="font-medium underline underline-offset-4">
                      Pedir otro enlace
                    </Link>
                  </>
                )}
              </AlertDescription>
            )}
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
                placeholder="Ej. tu@correo.com"
                autoComplete="username"
                enterKeyHint="next"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={ocupado}
              />
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                <Link href="/cooperativas/recuperar" className={`text-sm ${ENLACE}`}>
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={ocupado}
              />
            </Field>
          </FieldGroup>

          <Button type="submit" size="lg" className="w-full" disabled={ocupado} aria-busy={loading || undefined}>
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
          size="lg"
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
