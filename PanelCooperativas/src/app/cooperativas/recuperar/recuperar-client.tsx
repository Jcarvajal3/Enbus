"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { AuthLayout } from "@/components/auth-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { humanizeError } from "@/lib/errores";

export default function RecuperarPage() {
  const [supabase] = useState(() => createClient());
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

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (resetError) {
      setError(humanizeError(resetError, { accion: "enviar el enlace", email }));
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  const volver = (
    <Link
      href="/cooperativas/login"
      className={cn(buttonVariants({ variant: success ? "outline" : "ghost" }), "w-full", loading && "pointer-events-none opacity-50")}
    >
      <ArrowLeft aria-hidden />
      Volver a iniciar sesión
    </Link>
  );

  return (
    <AuthLayout
      zona="cooperativas"
      titulo="Recuperar contraseña"
      descripcion={success ? undefined : "Te enviaremos un enlace para crear una nueva."}
    >
      {success ? (
        <div className="flex flex-col gap-6">
          <Alert variant="success">
            <CheckCircle weight="fill" aria-hidden />
            <AlertTitle>Enlace enviado</AlertTitle>
            <AlertDescription>Revisa la bandeja de {email} (también Spam).</AlertDescription>
          </Alert>
          {volver}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {error && (
            <Alert variant="destructive">
              <WarningCircle weight="fill" aria-hidden />
              <AlertTitle>No pudimos enviar el enlace</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
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
          </FieldGroup>

          <div className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading} aria-busy={loading || undefined}>
              {loading && <Spinner size="sm" data-icon="inline-start" />}
              Enviar enlace
            </Button>
            {volver}
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
