"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Bus, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import { humanizeError } from "@/lib/errores";

export default function RestablecerPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function verifySession() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Pide un enlace nuevo para crear tu contraseña (los enlaces vencen y solo se pueden usar una vez).");
        setAuthorized(false);
      } else {
        setAuthorized(true);
      }
      setCheckingAuth(false);
    }
    verifySession();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      setError(humanizeError(updateError, "actualizar la contraseña"));
      setLoading(false);
      return;
    }

    // Password updated successfully. Let's find their role to redirect.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/cooperativas/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    setSuccess(true);
    setLoading(false);

    // Short timeout to show success state before redirecting
    setTimeout(() => {
      if (profile?.role === "taquillero") {
        router.push("/cooperativas/taquilla/encomiendas");
      } else if (profile?.role === "admin_cooperativa") {
        router.push("/cooperativas/dashboard");
      } else {
        router.push("/cooperativas/login");
      }
    }, 2000);
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Panel Izquierdo Decorativo (Oculto en mobile) */}
      <div className="hidden w-3/5 flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
            <Bus weight="fill" className="size-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">EnBus</span>
        </div>
        
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-bold leading-tight">
            Nueva <br />
            <span className="text-amber-300">contraseña</span>
          </h1>
          <p className="text-xl text-slate-400">
            Define tu nueva contraseña y accede al sistema de forma inmediata.
          </p>
        </div>
        
        <p className="text-sm text-slate-400">
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
            <CardTitle className="text-2xl">Nueva Contraseña</CardTitle>
            <CardDescription>
              Introduce tu nueva contraseña de acceso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && !authorized ? (
              <div className="flex flex-col gap-6">
                <Alert variant="destructive">
                  <WarningCircle className="size-4" data-icon="inline-start" />
                  <AlertTitle>El enlace venció o ya se usó</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <Button onClick={() => router.push("/cooperativas/recuperar")} className="w-full">
                  Pedir otro enlace
                </Button>
              </div>
            ) : success ? (
              <Alert variant="default" className="border-emerald-600/30 bg-emerald-50 text-success-text dark:bg-emerald-400/10">
                <CheckCircle className="size-4 text-success-text" data-icon="inline-start" />
                <AlertTitle>Contraseña actualizada</AlertTitle>
                <AlertDescription>
                  Listo. Te estamos llevando al panel…
                </AlertDescription>
              </Alert>
            ) : (
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
                    <FieldLabel htmlFor="password">Contraseña nueva</FieldLabel>
                    <Input 
                      id="password" 
                      type="password" 
                      required 
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="confirmPassword">Repite la contraseña</FieldLabel>
                    <Input 
                      id="confirmPassword" 
                      type="password" 
                      required 
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                    />
                  </Field>
                </FieldGroup>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Spinner data-icon="inline-start" /> : null}
                  Guardar contraseña
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
