"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Shield, WarningCircle, GoogleLogo } from "@phosphor-icons/react";
import { humanizeError } from "@/lib/errores";

const ERROR_GOOGLE = "No pudimos iniciar sesión con Google. Intenta de nuevo o usa tu correo.";

export default function AdminLoginClient({ errorInicial = null }: { errorInicial?: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(errorInicial);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || googleLoading) return;
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        setError(
          authError
            ? humanizeError(authError, { accion: "iniciar sesión", email })
            : "Correo o contraseña incorrectos. Revisa los datos e intenta de nuevo."
        );
        setLoading(false);
        return;
      }

      // Obtener el perfil para verificar que sea super_admin
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError(humanizeError(profileError, "verificar los permisos de tu cuenta"));
        setLoading(false);
        return;
      }

      if (profile.role !== "super_admin") {
        await supabase.auth.signOut();
        setError("Esta cuenta no es de administrador de EnBus. Entra con una cuenta de administrador o usa el panel de tu cooperativa.");
        setLoading(false);
        return;
      }

      router.push("/admin/dashboard");
      router.refresh();
    } catch (err) {
      setError(humanizeError(err, "iniciar sesión"));
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading || googleLoading) return;
    setGoogleLoading(true);
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/admin/auth/callback`,
        },
      });

      if (oauthError) {
        console.error("Google OAuth error:", oauthError);
        setError(ERROR_GOOGLE);
        setGoogleLoading(false);
      }
    } catch (err) {
      console.error("Google OAuth exception:", err);
      setError(ERROR_GOOGLE);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Panel izquierdo decorativo (oculto en móvil) */}
      <div className="hidden w-3/5 flex-col justify-between border-r bg-muted p-12 lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Shield weight="fill" className="size-6" aria-hidden />
          </div>
          <span className="text-xl font-bold tracking-tight">EnBus</span>
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-5xl leading-tight font-bold">
            Panel de <br />
            administración
          </h1>
          <p className="text-xl text-muted-foreground">
            Solicitudes, cooperativas, tarifas, comisiones e incidencias de EnBus.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} EnBus. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel derecho con el formulario */}
      <div className="flex w-full items-center justify-center p-6 lg:w-2/5">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Shield weight="fill" className="size-8" aria-hidden />
              </div>
            </div>
            <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
            <CardDescription className="text-muted-foreground">Administración de EnBus</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              {error && (
                <Alert variant="destructive">
                  <WarningCircle className="size-4" data-icon="inline-start" aria-hidden />
                  <AlertTitle>No pudiste entrar</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="email">Correo</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@enbus.com"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading || googleLoading}
                    />
                  </Field>
                  <Field>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                      <Link
                        href="/cooperativas/recuperar"
                        className="text-sm text-foreground underline decoration-primary underline-offset-4"
                      >
                        ¿Olvidaste tu contraseña?
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading || googleLoading}
                    />
                  </Field>
                </FieldGroup>

                <Button type="submit" className="w-full" disabled={loading || googleLoading} aria-busy={loading || undefined}>
                  {loading ? <Spinner data-icon="inline-start" className="mr-2" /> : null}
                  {loading ? "Entrando…" : "Entrar"}
                </Button>
              </form>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t" />
                <span className="mx-4 flex-shrink text-xs text-muted-foreground">o</span>
                <div className="flex-grow border-t" />
              </div>

              <Button
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={loading || googleLoading}
                aria-busy={googleLoading || undefined}
                className="w-full"
              >
                {googleLoading ? (
                  <Spinner data-icon="inline-start" className="mr-2" />
                ) : (
                  <GoogleLogo className="mr-2 size-5" aria-hidden />
                )}
                Continuar con Google
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
