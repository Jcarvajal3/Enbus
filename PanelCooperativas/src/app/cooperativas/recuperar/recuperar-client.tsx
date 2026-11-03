"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Bus, WarningCircle, CheckCircle, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { humanizeError } from "@/lib/errores";

export default function RecuperarPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = `${origin}/cooperativas/auth/callback?next=/cooperativas/restablecer`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (resetError) {
      setError(humanizeError(resetError, { accion: "enviar el enlace de recuperación", email }));
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
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
            Restablecer <br />
            <span className="text-primary">contraseña</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Recupera el acceso a tu panel operativo de forma segura.
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
            <CardTitle className="text-2xl">¿Olvidaste tu contraseña?</CardTitle>
            <CardDescription>
              Introduce tu correo y te enviaremos un enlace para restablecerla.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col gap-6">
                <Alert variant="default" className="border-success/40 bg-success-light text-success-deep">
                  <CheckCircle className="size-4 text-success-text" data-icon="inline-start" />
                  <AlertTitle>Enlace enviado</AlertTitle>
                  <AlertDescription>
                    Hemos enviado un correo con instrucciones para restablecer tu contraseña. Revisa tu bandeja de entrada.
                  </AlertDescription>
                </Alert>
                <Link href="/cooperativas/login" className={cn(buttonVariants({ variant: "outline" }), "w-full flex items-center justify-center gap-2")}>
                  <ArrowLeft className="size-4" />
                  Volver a iniciar sesión
                </Link>
              </div>
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
                    <FieldLabel htmlFor="email">Email de tu cuenta</FieldLabel>
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
                </FieldGroup>
                
                <div className="flex flex-col gap-3">
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Spinner data-icon="inline-start" /> : null}
                    Enviar Enlace de Recuperación
                  </Button>
                  <Link href="/cooperativas/login" className={cn(buttonVariants({ variant: "ghost" }), "w-full flex items-center justify-center gap-2", loading && "pointer-events-none opacity-50")}>
                    <ArrowLeft className="size-4" />
                    Volver
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
