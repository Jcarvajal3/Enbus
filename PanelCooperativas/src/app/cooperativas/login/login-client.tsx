"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Bus, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { humanizeError } from "@/lib/errores";

export default function LoginPage({ errorInicial = null }: { errorInicial?: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(errorInicial);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await iniciarSesion();
    } catch (err) {
      // Sin red o respuesta inesperada: el botón no puede quedar bloqueado.
      setError(humanizeError(err, "iniciar sesión"));
      setLoading(false);
    }
  };

  const iniciarSesion = async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      setError(
        authError
          ? humanizeError(authError, { accion: "iniciar sesión", email })
          : "Correo o contraseña incorrectos. Revisa los datos o recupera tu contraseña."
      );
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, cooperativa_id")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      // Sin perfil no hay acceso: no se deja una sesión a medias.
      await supabase.auth.signOut({ scope: "local" });
      setError(humanizeError(profileError, "cargar tu perfil"));
      setLoading(false);
      return;
    }

    if (profile.role !== "taquillero" && profile.role !== "admin_cooperativa") {
      // scope "local": solo esta sesión del navegador (no cierra la de la app móvil).
      await supabase.auth.signOut({ scope: "local" });
      setError("Tu cuenta no tiene acceso al panel de cooperativas. Si eres administrador o taquillero, pide al administrador de tu cooperativa que te invite.");
      setLoading(false);
      return;
    }

    if (!profile.cooperativa_id) {
      await supabase.auth.signOut({ scope: "local" });
      setError("Tu cuenta no está vinculada a ninguna cooperativa. Pide al administrador de tu cooperativa que te envíe una invitación.");
      setLoading(false);
      return;
    }

    // Success, router push
    if (profile.role === "taquillero") {
      router.push("/cooperativas/taquilla/encomiendas");
    } else {
      router.push("/cooperativas/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Panel Izquierdo Decorativo (Oculto en mobile) */}
      <div className="hidden w-3/5 flex-col justify-between dark bg-background p-12 text-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
            <Bus weight="fill" className="size-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">EnBus</span>
        </div>
        
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-bold leading-tight">
            Panel de <br />
            <span className="text-primary">Cooperativas</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Gestión operativa de rutas, taquilla y despacho.
          </p>
        </div>
        
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} EnBus. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel Derecho con Formulario */}
      <div className="flex w-full items-center justify-center p-6 lg:w-2/5">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary">
                <Bus weight="fill" className="size-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
            <CardDescription>Accede al panel de tu cooperativa</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {error && (
                <Alert variant="destructive">
                  <WarningCircle className="size-4" data-icon="inline-start" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="nombre@cooperativa.com" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </Field>
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                    <Link href="/cooperativas/recuperar" className="text-sm font-medium text-primary-text underline-offset-4 hover:underline">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                  <Input 
                    id="password" 
                    type="password" 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </Field>
              </FieldGroup>
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Spinner data-icon="inline-start" /> : null}
                Iniciar sesión
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                ¿No tienes cuenta?{" "}
                <Link href="/cooperativas/registro" className="font-medium text-primary-text underline-offset-4 hover:underline">
                  Registra tu cooperativa
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
