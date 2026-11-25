"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Info, WarningCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { avisarExito } from "@/lib/avisos";
import { CLAVE_AYUDA, CLAVE_ERROR, CLAVE_MINIMO } from "@/lib/ve";
import { cambiarClave } from "@/app/(sitio)/cuenta/configuracion/acciones";
import estilos from "./configuracion.module.css";

type Errores = { actual?: string; nueva?: string; repetir?: string };

/** Cambiar la contraseña (o crearla, si la cuenta solo entra con Google). */
export function CambiarClave({ tieneClave }: { tieneClave: boolean }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState(false);
  const conClave = tieneClave || creada;
  const [pendiente, empezar] = useTransition();

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (pendiente) return;
    const faltas: Errores = {
      ...(conClave && !actual ? { actual: "Escribe tu contraseña actual." } : {}),
      ...(!nueva ? { nueva: "Escribe la contraseña nueva." } : nueva.length < CLAVE_MINIMO ? { nueva: CLAVE_ERROR } : {}),
      ...(nueva && repetir !== nueva ? { repetir: "Las contraseñas no coinciden." } : {}),
    };
    setErrores(faltas);
    setError(null);
    if (Object.keys(faltas).length > 0) return;

    empezar(async () => {
      try {
        const r = await cambiarClave({ actual, nueva });
        if (!r.success) {
          if (r.codigo === "ACTUAL") setErrores({ actual: r.error });
          else if (r.codigo === "NUEVA") setErrores({ nueva: r.error });
          else setError(r.error);
          return;
        }
        setActual("");
        setNueva("");
        setRepetir("");
        setCreada(true);
        avisarExito(
          r.data.creada
            ? "Listo. Ya puedes entrar también con tu correo y tu contraseña."
            : "Listo. Tu contraseña cambió."
        );
      } catch {
        setError("No pudimos guardar la contraseña. Revisa tu conexión e intenta de nuevo.");
      }
    });
  };

  const titulo = conClave ? "Cambiar contraseña" : "Crear una contraseña";

  return (
    <section className={estilos.seccion} aria-labelledby="clave-titulo">
      <div className={estilos.seccionCab}>
        <h2 id="clave-titulo">Contraseña</h2>
        <p>
          {tieneClave
            ? "Para tu seguridad, te pedimos la actual antes de cambiarla."
            : "Tu cuenta entra con Google. Si quieres, crea una contraseña para entrar también con tu correo."}
        </p>
      </div>
      <form onSubmit={enviar} noValidate className={estilos.formulario} aria-label={titulo}>
        {!conClave && (
          <Alert>
            <Info aria-hidden weight="fill" />
            <AlertTitle>Cuenta con Google</AlertTitle>
            <AlertDescription>No necesitas contraseña para entrar; esto es opcional.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" aria-live="polite">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>No pudimos guardar la contraseña</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <FieldGroup className="gap-5">
          {conClave && (
            <Field data-invalid={errores.actual ? true : undefined}>
              <FieldLabel htmlFor="clave-actual">Contraseña actual</FieldLabel>
              <PasswordInput
                id="clave-actual"
                autoComplete="current-password"
                enterKeyHint="next"
                value={actual}
                onChange={(e) => {
                  setActual(e.target.value);
                  setErrores((p) => ({ ...p, actual: undefined }));
                }}
                aria-invalid={errores.actual ? true : undefined}
                aria-describedby={errores.actual ? "clave-actual-error" : undefined}
                disabled={pendiente}
              />
              {errores.actual && <FieldError id="clave-actual-error">{errores.actual}</FieldError>}
            </Field>
          )}
          <Field data-invalid={errores.nueva ? true : undefined}>
            <FieldLabel htmlFor="clave-nueva">Contraseña nueva</FieldLabel>
            <PasswordInput
              id="clave-nueva"
              autoComplete="new-password"
              enterKeyHint="next"
              value={nueva}
              onChange={(e) => {
                setNueva(e.target.value);
                setErrores((p) => ({ ...p, nueva: undefined }));
              }}
              aria-invalid={errores.nueva ? true : undefined}
              aria-describedby={errores.nueva ? "clave-nueva-error" : "clave-nueva-ayuda"}
              disabled={pendiente}
            />
            {errores.nueva ? (
              <FieldError id="clave-nueva-error">{errores.nueva}</FieldError>
            ) : (
              <FieldDescription id="clave-nueva-ayuda">{CLAVE_AYUDA}</FieldDescription>
            )}
          </Field>
          <Field data-invalid={errores.repetir ? true : undefined}>
            <FieldLabel htmlFor="clave-repetir">Repite la contraseña nueva</FieldLabel>
            <PasswordInput
              id="clave-repetir"
              autoComplete="new-password"
              enterKeyHint="done"
              value={repetir}
              onChange={(e) => {
                setRepetir(e.target.value);
                setErrores((p) => ({ ...p, repetir: undefined }));
              }}
              aria-invalid={errores.repetir ? true : undefined}
              aria-describedby={errores.repetir ? "clave-repetir-error" : undefined}
              disabled={pendiente}
            />
            {errores.repetir && <FieldError id="clave-repetir-error">{errores.repetir}</FieldError>}
          </Field>
        </FieldGroup>
        <div>
          <Button type="submit" size="lg" disabled={pendiente} aria-busy={pendiente || undefined}>
            {pendiente && <Spinner size="sm" aria-hidden />}
            {pendiente ? "Guardando…" : titulo}
          </Button>
        </div>
      </form>
    </section>
  );
}
