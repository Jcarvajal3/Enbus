"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { humanizeError } from "@/lib/errores";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { createClient } from "@/lib/supabase/client";
import { CLAVE_AYUDA, CLAVE_ERROR, CLAVE_MINIMO } from "@/lib/ve";
import { TarjetaAuth } from "./tarjeta-auth";

type Estado = "revisando" | "vencido" | "formulario" | "listo";

export function FormularioRestablecer() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [estado, setEstado] = useState<Estado>("revisando");
  const [clave, setClave] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [errores, setErrores] = useState<{ clave?: string; confirmacion?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // El enlace del correo pasó por /auth/callback, que dejó una sesión de recuperación.
  useEffect(() => {
    let vivo = true;
    const revisar = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (vivo) setEstado(data.user ? "formulario" : "vencido");
      } catch {
        if (vivo) setEstado("vencido");
      }
    };
    void revisar();
    return () => {
      vivo = false;
    };
  }, [supabase]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (cargando) return;
    setError(null);
    if (clave.length < CLAVE_MINIMO) {
      setErrores({ clave: CLAVE_ERROR });
      return;
    }
    if (clave !== confirmacion) {
      setErrores({ confirmacion: "Las contraseñas no coinciden." });
      return;
    }
    setErrores({});
    setCargando(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password: clave });
      if (authError) throw authError;
      setEstado("listo");
      // Un momento para leer el aviso antes de entrar.
      setTimeout(() => {
        router.replace(RUTAS_PASAJERO.cuenta);
        router.refresh();
      }, 1800);
    } catch (err) {
      setError(humanizeError(err, "guardar la contraseña"));
    } finally {
      setCargando(false);
    }
  };

  return (
    <TarjetaAuth
      titulo="Elige tu contraseña nueva"
      descripcion={estado === "formulario" ? "Con ella vas a ingresar de ahora en adelante." : undefined}
    >
      {estado === "revisando" && (
        <div role="status" aria-label="Cargando" className="flex flex-col gap-6">
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      )}

      {estado === "vencido" && (
        <div className="flex flex-col gap-6">
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>El enlace venció o ya se usó</AlertTitle>
            <AlertDescription>Los enlaces sirven una sola vez. Pide uno nuevo.</AlertDescription>
          </Alert>
          <Link
            href={RUTAS_PASAJERO.recuperarClave}
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Pedir otro enlace
          </Link>
        </div>
      )}

      {estado === "listo" && (
        <Alert variant="success" role="status">
          <CheckCircle weight="fill" aria-hidden />
          <AlertTitle>Contraseña guardada</AlertTitle>
          <AlertDescription>Te estamos llevando a tu cuenta…</AlertDescription>
        </Alert>
      )}

      {estado === "formulario" && (
        <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
          {error && (
            <Alert variant="destructive" aria-live="polite">
              <WarningCircle weight="fill" aria-hidden />
              <AlertTitle>No pudimos guardar la contraseña</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field data-invalid={errores.clave ? true : undefined}>
              <FieldLabel htmlFor="restablecer-clave">Contraseña nueva</FieldLabel>
              <PasswordInput
                id="restablecer-clave"
                autoComplete="new-password"
                enterKeyHint="next"
                required
                aria-invalid={errores.clave ? true : undefined}
                aria-describedby="restablecer-clave-ayuda"
                value={clave}
                onChange={(e) => {
                  setClave(e.target.value);
                  setErrores({});
                }}
                disabled={cargando}
              />
              {errores.clave ? (
                <FieldError id="restablecer-clave-ayuda">{errores.clave}</FieldError>
              ) : (
                <FieldDescription id="restablecer-clave-ayuda">{CLAVE_AYUDA}</FieldDescription>
              )}
            </Field>
            <Field data-invalid={errores.confirmacion ? true : undefined}>
              <FieldLabel htmlFor="restablecer-confirmacion">Repite la contraseña</FieldLabel>
              <PasswordInput
                id="restablecer-confirmacion"
                autoComplete="new-password"
                enterKeyHint="done"
                required
                aria-invalid={errores.confirmacion ? true : undefined}
                aria-describedby={errores.confirmacion ? "restablecer-confirmacion-error" : undefined}
                value={confirmacion}
                onChange={(e) => {
                  setConfirmacion(e.target.value);
                  setErrores({});
                }}
                disabled={cargando}
              />
              {errores.confirmacion && (
                <FieldError id="restablecer-confirmacion-error">{errores.confirmacion}</FieldError>
              )}
            </Field>
          </FieldGroup>
          <Button type="submit" size="lg" className="w-full" disabled={cargando} aria-busy={cargando || undefined}>
            {cargando && <Spinner size="sm" aria-hidden />}
            Guardar contraseña
          </Button>
        </form>
      )}
    </TarjetaAuth>
  );
}
