"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { AuthLayout } from "@/components/auth-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { humanizeError } from "@/lib/errores";
import { CLAVE_AYUDA, CLAVE_ERROR, CLAVE_MINIMO } from "@/lib/ve";
import { INICIO } from "@/lib/navigation";

type Estado = "revisando" | "vencido" | "formulario" | "listo";

export default function RestablecerPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [estado, setEstado] = useState<Estado>("revisando");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCampo, setErrorCampo] = useState<{ password?: string; confirmPassword?: string }>({});

  useEffect(() => {
    let vivo = true;
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (vivo) setEstado(user ? "formulario" : "vencido");
      })
      .catch(() => {
        if (vivo) setEstado("vencido");
      });
    return () => {
      vivo = false;
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < CLAVE_MINIMO) {
      setErrorCampo({ password: CLAVE_ERROR });
      return;
    }
    if (password !== confirmPassword) {
      setErrorCampo({ confirmPassword: "Las contraseñas no coinciden." });
      return;
    }
    setErrorCampo({});
    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(humanizeError(updateError, "guardar la contraseña"));
      setLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from("profiles").select("role").eq("id", user.id).single()
      : { data: null };

    setEstado("listo");
    setLoading(false);

    // Un momento para leer el aviso antes de entrar.
    const esCooperativa = profile?.role === "taquillero" || profile?.role === "admin_cooperativa";
    setTimeout(() => router.replace(esCooperativa ? INICIO : "/cooperativas/login"), 2000);
  };

  return (
    <AuthLayout
      zona="cooperativas"
      titulo="Nueva contraseña"
      descripcion={estado === "formulario" ? "Elige la contraseña con la que vas a entrar." : undefined}
    >
      {estado === "revisando" && (
        <div role="status" aria-label="Cargando" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full rounded-full" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-9 w-full rounded-full" />
          </div>
          <Skeleton className="h-9 w-full rounded-full" />
        </div>
      )}

      {estado === "vencido" && (
        <div className="flex flex-col gap-6">
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>El enlace venció o ya se usó</AlertTitle>
            <AlertDescription>Los enlaces sirven una sola vez. Pide uno nuevo.</AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <Link href="/cooperativas/recuperar" className={buttonVariants({ className: "w-full" })}>
              Pedir otro enlace
            </Link>
            <Link href="/cooperativas/login" className={buttonVariants({ variant: "ghost", className: "w-full" })}>
              <ArrowLeft aria-hidden />
              Volver a iniciar sesión
            </Link>
          </div>
        </div>
      )}

      {estado === "listo" && (
        <Alert variant="success">
          <CheckCircle weight="fill" aria-hidden />
          <AlertTitle>Contraseña guardada</AlertTitle>
          <AlertDescription>Te estamos llevando al panel…</AlertDescription>
        </Alert>
      )}

      {estado === "formulario" && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          {error && (
            <Alert variant="destructive">
              <WarningCircle weight="fill" aria-hidden />
              <AlertTitle>No pudimos guardar la contraseña</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FieldGroup>
            <Field data-invalid={errorCampo.password ? true : undefined}>
              <FieldLabel htmlFor="password">Contraseña nueva</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={CLAVE_MINIMO}
                aria-invalid={errorCampo.password ? true : undefined}
                aria-describedby="password-ayuda"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorCampo({});
                }}
                disabled={loading}
              />
              {errorCampo.password ? (
                <FieldError id="password-ayuda">{errorCampo.password}</FieldError>
              ) : (
                <FieldDescription id="password-ayuda">{CLAVE_AYUDA}</FieldDescription>
              )}
            </Field>
            <Field data-invalid={errorCampo.confirmPassword ? true : undefined}>
              <FieldLabel htmlFor="confirmPassword">Repite la contraseña</FieldLabel>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                aria-invalid={errorCampo.confirmPassword ? true : undefined}
                aria-describedby={errorCampo.confirmPassword ? "confirmPassword-error" : undefined}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setErrorCampo({});
                }}
                disabled={loading}
              />
              {errorCampo.confirmPassword && (
                <FieldError id="confirmPassword-error">{errorCampo.confirmPassword}</FieldError>
              )}
            </Field>
          </FieldGroup>

          <Button type="submit" className="w-full" disabled={loading} aria-busy={loading || undefined}>
            {loading && <Spinner size="sm" data-icon="inline-start" />}
            Guardar contraseña
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
