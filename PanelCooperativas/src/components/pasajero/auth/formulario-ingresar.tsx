"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { humanizeError, MSG } from "@/lib/errores";
import { RUTAS_PASAJERO, urlCrearCuenta } from "@/lib/pasajero/rutas";
import { createClient } from "@/lib/supabase/client";
import { BotonGoogle } from "./boton-google";
import { TarjetaAuth } from "./tarjeta-auth";
import { CLASE_CAMPO_AUTH, correoValido, CORREO_ERROR } from "./utils";

export type AvisoIngreso = "enlace" | "google" | null;

interface Props {
  next: string | null;
  aviso: AvisoIngreso;
}

type Mensaje = { titulo: string; detalle?: string };

const AVISOS: Record<Exclude<AvisoIngreso, null>, Mensaje> = {
  enlace: { titulo: "El enlace venció o ya se usó", detalle: "Ingresa con tu contraseña o pide un enlace nuevo." },
  google: { titulo: "No pudiste entrar con Google", detalle: "Intenta de nuevo o usa tu correo y contraseña." },
};

export function FormularioIngresar({ next, aviso }: Props) {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [error, setError] = useState<Mensaje | null>(aviso ? AVISOS[aviso] : null);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (cargando) return;
    setError(null);
    const email = correo.trim();
    if (!correoValido(email)) {
      setErrorCorreo(CORREO_ERROR);
      return;
    }
    if (!clave) {
      setError({ titulo: "Falta tu contraseña", detalle: "Escríbela para entrar." });
      return;
    }
    setErrorCorreo(null);
    setCargando(true);
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({ email, password: clave });
      if (authError) {
        const texto = humanizeError(authError, { accion: "iniciar sesión", email });
        setError(
          texto === MSG.credenciales
            ? { titulo: "Correo o contraseña incorrectos", detalle: "Revisa los datos o recupera tu contraseña." }
            : { titulo: "No pudiste entrar", detalle: texto },
        );
        setCargando(false);
        return;
      }
      // El servidor ya ve la sesión y decide por el rol (una cuenta del panel cae en el
      // aviso de /ingresar, no en un bucle).
      router.replace(next ?? RUTAS_PASAJERO.cuenta);
      router.refresh();
    } catch (err) {
      setError({ titulo: "No pudiste entrar", detalle: humanizeError(err, "iniciar sesión") });
      setCargando(false);
    }
  };

  return (
    <TarjetaAuth
      titulo="Ingresa a tu cuenta"
      descripcion="Para elegir asientos, enviar encomiendas y ver tus boletos."
      pie={
        <>
          ¿No tienes cuenta?{" "}
          <Link href={urlCrearCuenta(next)} className="s-enlace">
            Crea una
          </Link>
        </>
      }
    >
      <div aria-live="polite">
        {error && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>{error.titulo}</AlertTitle>
            {error.detalle && <AlertDescription>{error.detalle}</AlertDescription>}
          </Alert>
        )}
      </div>

      <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <FieldGroup className="gap-5">
          <Field data-invalid={errorCorreo ? true : undefined}>
            <FieldLabel htmlFor="ingresar-correo">Correo</FieldLabel>
            <Input
              id="ingresar-correo"
              className={CLASE_CAMPO_AUTH}
              type="email"
              inputMode="email"
              placeholder="Ej. tu@correo.com"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              required
              aria-invalid={errorCorreo ? true : undefined}
              aria-describedby={errorCorreo ? "ingresar-correo-error" : undefined}
              value={correo}
              onChange={(e) => {
                setCorreo(e.target.value);
                setErrorCorreo(null);
              }}
              disabled={cargando}
            />
            {errorCorreo && <FieldError id="ingresar-correo-error">{errorCorreo}</FieldError>}
          </Field>
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="ingresar-clave">Contraseña</FieldLabel>
              <Link href={RUTAS_PASAJERO.recuperarClave} className="s-enlace text-sm">
                ¿La olvidaste?
              </Link>
            </div>
            <PasswordInput
              id="ingresar-clave"
              className={CLASE_CAMPO_AUTH}
              autoComplete="current-password"
              enterKeyHint="done"
              required
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              disabled={cargando}
            />
          </Field>
        </FieldGroup>

        <Button type="submit" size="lg" className="w-full" disabled={cargando} aria-busy={cargando || undefined}>
          {cargando && <Spinner size="sm" aria-hidden />}
          {cargando ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <BotonGoogle next={next} disabled={cargando} onError={() => setError(AVISOS.google)} />
    </TarjetaAuth>
  );
}
