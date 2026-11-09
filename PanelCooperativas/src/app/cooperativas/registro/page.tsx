"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { registrarCooperativa, verificarCorreoRegistro, type ActionState, type CampoRegistro } from "./actions";
import { normalizeRif, RIF_AYUDA, RIF_AYUDA_CORTA, RIF_PLACEHOLDER } from "@/lib/rif";
import { CLAVE_AYUDA, CLAVE_ERROR, CLAVE_MINIMO, telefonoValido, TELEFONO_ERROR } from "@/lib/ve";
import { TelefonoField } from "@/components/ve-fields";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { FieldGroup, Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { WarningCircle, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

// Campos del paso 1: si el servidor rechaza alguno, se vuelve a ese paso para corregirlo.
const CAMPOS_PASO_1: CampoRegistro[] = ["nombre", "email", "password", "confirmPassword"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENLACE = "font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline";
const MSG_EMAIL_USADO = "Ya existe una cuenta con este correo. Inicia sesión o usa otro correo.";

type Errores = Partial<Record<CampoRegistro, string>>;

/** Sitio público de EnBus (términos y privacidad). Sin la variable, el enlace no se muestra. */
const SITIO_URL = (process.env.NEXT_PUBLIC_SITIO_URL ?? "").trim().replace(/\/+$/, "") || null;

/** Enfoca el campo por su ref o, si no la tiene (TelefonoField), por su id. */
function enfocarCampo(el: HTMLInputElement | HTMLTextAreaElement | null | undefined, campo: CampoRegistro) {
  (el ?? (document.getElementById(campo) as HTMLInputElement | null))?.focus();
}

/** Mismas reglas que el servidor (registro/actions.ts). */
function validarPaso1(d: { nombre: string; email: string; password: string; confirmPassword: string }): Errores {
  const e: Errores = {};
  if (d.nombre.trim().length < 3) e.nombre = "Escribe el nombre de tu cooperativa (mínimo 3 caracteres).";
  if (!EMAIL_RE.test(d.email.trim())) e.email = "Escribe un correo válido, por ejemplo tu@correo.com.";
  if (d.password.length < CLAVE_MINIMO) e.password = CLAVE_ERROR;
  else if (d.password !== d.confirmPassword) e.confirmPassword = "Las contraseñas no coinciden.";
  return e;
}

function validarPaso2(d: { rif: string; telefono: string; representante: string }): Errores {
  const e: Errores = {};
  if (!normalizeRif(d.rif)) e.rif = RIF_AYUDA;
  if (!telefonoValido(d.telefono)) e.telefono = TELEFONO_ERROR;
  if (d.representante.trim().length < 3) e.representante = "Escribe el nombre y apellido del representante legal.";
  return e;
}

export default function RegistroCooperativaPage() {
  const [step, setStep] = useState(1);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(registrarCooperativa, {
    error: null,
    success: false,
  });

  // Paso 1
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificandoCorreo, setVerificandoCorreo] = useState(false);

  // Paso 2 (controlado para que un error del servidor no borre lo escrito)
  const [rif, setRif] = useState("");
  const [telefono, setTelefono] = useState("");
  const [representante, setRepresentante] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [errores, setErrores] = useState<Errores>({});
  const refs = useRef<Partial<Record<CampoRegistro, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const enfocar = (campo?: CampoRegistro) => {
    if (!campo) return;
    // Espera a que el paso correspondiente esté montado.
    window.setTimeout(() => enfocarCampo(refs.current[campo], campo), 0);
  };

  // Respuesta nueva del servidor: errores por campo y vuelta al paso donde está el problema.
  const [estadoPrevio, setEstadoPrevio] = useState(state);
  if (state !== estadoPrevio) {
    setEstadoPrevio(state);
    setErrores(state?.errores ?? {});
    if (state?.campo && CAMPOS_PASO_1.includes(state.campo)) setStep(1);
  }
  // Foco en el primer campo con error que devolvió el servidor.
  useEffect(() => {
    if (state?.campo) enfocarCampo(refs.current[state.campo], state.campo);
  }, [state]);
  // Error general (sin campo) del servidor: se muestra arriba del formulario.
  const errorGeneral = state?.error && !state?.errores ? state.error : null;

  const limpiar = (campo: CampoRegistro) =>
    setErrores((prev) => {
      if (!prev[campo]) return prev;
      const siguiente = { ...prev };
      delete siguiente[campo];
      return siguiente;
    });

  async function continuar(e: FormEvent) {
    e.preventDefault();
    if (verificandoCorreo) return;
    const encontrados = validarPaso1({ nombre, email, password, confirmPassword });
    setErrores(encontrados);
    const primero = CAMPOS_PASO_1.find((c) => encontrados[c]);
    if (primero) {
      enfocar(primero);
      return;
    }
    // El correo se verifica aquí para no pedir los datos de la cooperativa en vano.
    setVerificandoCorreo(true);
    try {
      const res = await verificarCorreoRegistro(email);
      if (res.codigo === "EB_DEMASIADOS_INTENTOS") {
        // Límite de consultas desde esta conexión: no se avanza para no revelar correos.
        setErrores({ email: res.error });
        enfocar("email");
        return;
      }
      if (res.registrado) {
        setErrores({ email: MSG_EMAIL_USADO });
        enfocar("email");
        return;
      }
    } catch {
      // Sin conexión o error del servidor: se sigue; el registro lo vuelve a comprobar.
    } finally {
      setVerificandoCorreo(false);
    }
    setStep(2);
    enfocar("rif");
  }

  function enviarPaso2(e: FormEvent<HTMLFormElement>) {
    const encontrados = validarPaso2({ rif, telefono, representante });
    if (Object.keys(encontrados).length > 0) {
      e.preventDefault();
      setErrores(encontrados);
      enfocar((["rif", "telefono", "representante"] as CampoRegistro[]).find((c) => encontrados[c]));
    }
  }

  const ayuda = (campo: CampoRegistro) => (errores[campo] ? `${campo}-error` : undefined);


  return (
    <AuthLayout
      zona="cooperativas"
      titulo="Registrar cooperativa"
      descripcion={step === 1 ? "Paso 1 de 2 · Tu cuenta de administrador" : "Paso 2 de 2 · Datos de la cooperativa"}
      pie={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/cooperativas/login" className={ENLACE}>
            Inicia sesión
          </Link>
        </>
      }
    >
      {errorGeneral && (
        <Alert variant="destructive">
          <WarningCircle weight="fill" aria-hidden />
          <AlertTitle>{state?.success ? "Falta iniciar sesión" : "No pudimos completar el registro"}</AlertTitle>
          <AlertDescription>
            {errorGeneral}
            {state?.success && (
              <Link href="/cooperativas/login" className="font-medium underline underline-offset-4">
                Ir a iniciar sesión
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Paso 1: cuenta (Enter avanza) */}
      {step === 1 && (
        <form onSubmit={continuar} noValidate className="flex flex-col gap-6">
          <FieldGroup>
            <Field data-invalid={errores.nombre ? true : undefined}>
              <FieldLabel htmlFor="nombre">Nombre de la cooperativa</FieldLabel>
              <Input
                id="nombre"
                ref={(el) => { refs.current.nombre = el; }}
                type="text"
                placeholder="Ej.: Expresos Los Andes"
                autoComplete="organization"
                aria-invalid={errores.nombre ? true : undefined}
                aria-describedby={ayuda("nombre")}
                value={nombre}
                onChange={(e) => { setNombre(e.target.value); limpiar("nombre"); }}
                disabled={verificandoCorreo}
              />
              <FieldError id="nombre-error">{errores.nombre}</FieldError>
            </Field>

            <Field data-invalid={errores.email ? true : undefined}>
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <Input
                id="email"
                ref={(el) => { refs.current.email = el; }}
                type="email"
                placeholder="tu@correo.com"
                autoComplete="email"
                aria-invalid={errores.email ? true : undefined}
                aria-describedby={ayuda("email")}
                value={email}
                onChange={(e) => { setEmail(e.target.value); limpiar("email"); }}
                disabled={verificandoCorreo}
              />
              {/* Condicional: con varios hijos FieldError se pinta aunque no haya error (alerta vacía). */}
              {errores.email && (
                <FieldError id="email-error">
                  {errores.email}
                  {errores.email === MSG_EMAIL_USADO && (
                    <>
                      {" "}
                      <Link href="/cooperativas/login" className="font-medium underline underline-offset-4">
                        Iniciar sesión
                      </Link>
                    </>
                  )}
                </FieldError>
              )}
            </Field>

            <Field data-invalid={errores.password ? true : undefined}>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <PasswordInput
                id="password"
                ref={(el) => { refs.current.password = el; }}
                autoComplete="new-password"
                aria-invalid={errores.password ? true : undefined}
                aria-describedby={errores.password ? "password-error" : "password-ayuda"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); limpiar("password"); }}
                disabled={verificandoCorreo}
              />
              {errores.password ? (
                <FieldError id="password-error">{errores.password}</FieldError>
              ) : (
                <FieldDescription id="password-ayuda">{CLAVE_AYUDA}</FieldDescription>
              )}
            </Field>

            <Field data-invalid={errores.confirmPassword ? true : undefined}>
              <FieldLabel htmlFor="confirmPassword">Repite la contraseña</FieldLabel>
              <PasswordInput
                id="confirmPassword"
                ref={(el) => { refs.current.confirmPassword = el; }}
                autoComplete="new-password"
                aria-invalid={errores.confirmPassword ? true : undefined}
                aria-describedby={ayuda("confirmPassword")}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); limpiar("confirmPassword"); }}
                disabled={verificandoCorreo}
              />
              <FieldError id="confirmPassword-error">{errores.confirmPassword}</FieldError>
            </Field>
          </FieldGroup>

          <Button type="submit" className="w-full" disabled={verificandoCorreo} aria-busy={verificandoCorreo || undefined}>
            {verificandoCorreo && <Spinner size="sm" data-icon="inline-start" />}
            {verificandoCorreo ? "Verificando el correo…" : "Continuar"}
            {!verificandoCorreo && <ArrowRight aria-hidden />}
          </Button>
        </form>
      )}

      {/* Paso 2: datos de la cooperativa */}
      {step === 2 && (
        <form action={formAction} onSubmit={enviarPaso2} noValidate className="flex flex-col gap-6">
          {/* Datos del paso 1 */}
          <input type="hidden" name="nombre" value={nombre} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="password" value={password} />
          <input type="hidden" name="confirmPassword" value={confirmPassword} />

          <FieldGroup>
            <Field data-invalid={errores.rif ? true : undefined}>
              <FieldLabel htmlFor="rif">RIF de la cooperativa</FieldLabel>
              <Input
                id="rif"
                ref={(el) => { refs.current.rif = el; }}
                name="rif"
                type="text"
                placeholder={RIF_PLACEHOLDER}
                autoCapitalize="characters"
                aria-invalid={errores.rif ? true : undefined}
                aria-describedby={errores.rif ? "rif-error" : "rif-ayuda"}
                value={rif}
                onChange={(e) => { setRif(e.target.value); limpiar("rif"); }}
                onBlur={() => setRif((actual) => normalizeRif(actual) ?? actual)}
                disabled={isPending}
              />
              {errores.rif ? (
                <FieldError id="rif-error">{errores.rif}</FieldError>
              ) : (
                <FieldDescription id="rif-ayuda">{RIF_AYUDA_CORTA}</FieldDescription>
              )}
            </Field>

            <TelefonoField
              id="telefono"
              name="telefono"
              label="Teléfono de contacto"
              value={telefono}
              onChange={(v) => { setTelefono(v); limpiar("telefono"); }}
              error={errores.telefono}
              required
              disabled={isPending}
            />

            <Field data-invalid={errores.representante ? true : undefined}>
              <FieldLabel htmlFor="representante">Representante legal</FieldLabel>
              <Input
                id="representante"
                ref={(el) => { refs.current.representante = el; }}
                name="representante"
                type="text"
                placeholder="Ej.: Carlos Mendoza"
                autoComplete="name"
                aria-invalid={errores.representante ? true : undefined}
                aria-describedby={ayuda("representante")}
                value={representante}
                onChange={(e) => { setRepresentante(e.target.value); limpiar("representante"); }}
                disabled={isPending}
              />
              <FieldError id="representante-error">{errores.representante}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="mensaje">Rutas de interés (opcional)</FieldLabel>
              <Textarea
                id="mensaje"
                ref={(el) => { refs.current.mensaje = el; }}
                name="mensaje"
                rows={3}
                maxLength={1000}
                placeholder="Ej.: Caracas – Valencia"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                disabled={isPending}
              />
            </Field>
          </FieldGroup>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setErrores({});
                setStep(1);
              }}
              disabled={isPending}
            >
              <ArrowLeft aria-hidden />
              Atrás
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending} aria-busy={isPending || undefined}>
              {isPending && <Spinner size="sm" data-icon="inline-start" />}
              {isPending ? "Creando tu cuenta…" : "Crear cuenta"}
            </Button>
          </div>

          {SITIO_URL && (
            <p className="text-center text-xs text-muted-foreground">
              Al registrarte aceptas los{" "}
              <a href={`${SITIO_URL}/terminos`} target="_blank" rel="noopener noreferrer" className={ENLACE}>
                Términos y condiciones
              </a>{" "}
              y la{" "}
              <a href={`${SITIO_URL}/privacidad`} target="_blank" rel="noopener noreferrer" className={ENLACE}>
                Política de privacidad
              </a>{" "}
              de EnBus.
            </p>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
