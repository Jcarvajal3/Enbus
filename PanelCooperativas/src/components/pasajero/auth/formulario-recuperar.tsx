"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, EnvelopeSimple, WarningCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { humanizeError } from "@/lib/errores";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { createClient } from "@/lib/supabase/client";
import { TarjetaAuth } from "./tarjeta-auth";
import { CLASE_CAMPO_AUTH, correoValido, CORREO_ERROR, urlCallback } from "./utils";
import estilos from "./auth.module.css";

export function FormularioRecuperar({ vencido }: { vencido: boolean }) {
  const [correo, setCorreo] = useState("");
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviadoA, setEnviadoA] = useState<string | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (cargando) return;
    setError(null);
    const email = correo.trim();
    if (!correoValido(email)) {
      setErrorCorreo(CORREO_ERROR);
      return;
    }
    setErrorCorreo(null);
    setCargando(true);
    try {
      const { error: authError } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: urlCallback(RUTAS_PASAJERO.restablecerClave),
      });
      if (authError) throw authError;
      setEnviadoA(email);
    } catch (err) {
      setError(humanizeError(err, { accion: "enviar el enlace", email }));
    } finally {
      setCargando(false);
    }
  };

  if (enviadoA) {
    return (
      <TarjetaAuth titulo="Revisa tu correo">
        <div className={estilos.estado} role="status">
          <span className="s-icono s-icono--sol">
            <EnvelopeSimple aria-hidden />
          </span>
          <p>
            Si <strong>{enviadoA}</strong> tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva.
          </p>
          <p>Si no lo ves, revisa la carpeta de correo no deseado.</p>
        </div>
        <Link
          href={RUTAS_PASAJERO.ingresar}
          className={buttonVariants({ variant: "outline", size: "lg", className: "w-full" })}
        >
          <ArrowLeft aria-hidden />
          Volver a ingresar
        </Link>
      </TarjetaAuth>
    );
  }

  return (
    <TarjetaAuth
      titulo="Recupera tu contraseña"
      descripcion="Escribe el correo de tu cuenta y te enviamos un enlace para elegir una nueva."
      pie={
        <Link href={RUTAS_PASAJERO.ingresar} className="s-enlace">
          Volver a ingresar
        </Link>
      }
    >
      <div aria-live="polite" className="flex flex-col gap-3">
        {vencido && !error && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>El enlace venció o ya se usó</AlertTitle>
            <AlertDescription>Los enlaces sirven una sola vez. Pide uno nuevo.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>No pudimos enviar el enlace</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <Field data-invalid={errorCorreo ? true : undefined}>
          <FieldLabel htmlFor="recuperar-correo">Correo</FieldLabel>
          <Input
            id="recuperar-correo"
            className={CLASE_CAMPO_AUTH}
            type="email"
            inputMode="email"
            placeholder="Ej. tu@correo.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            required
            aria-invalid={errorCorreo ? true : undefined}
            aria-describedby={errorCorreo ? "recuperar-correo-error" : undefined}
            value={correo}
            onChange={(e) => {
              setCorreo(e.target.value);
              setErrorCorreo(null);
            }}
            disabled={cargando}
          />
          {errorCorreo && <FieldError id="recuperar-correo-error">{errorCorreo}</FieldError>}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={cargando} aria-busy={cargando || undefined}>
          {cargando && <Spinner size="sm" aria-hidden />}
          {cargando ? "Enviando…" : "Enviar enlace"}
        </Button>
      </form>
    </TarjetaAuth>
  );
}
