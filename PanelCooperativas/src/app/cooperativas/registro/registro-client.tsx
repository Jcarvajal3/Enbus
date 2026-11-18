"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, GoogleLogo, WarningCircle } from "@phosphor-icons/react";
import {
  crearCuentaCooperativa,
  completarOnboardingCooperativa,
  type ActionState,
  type CampoRegistro,
} from "./actions";
import { createClient } from "@/lib/supabase/client";
import { normalizeRif, RIF_AYUDA, RIF_AYUDA_CORTA, RIF_PLACEHOLDER } from "@/lib/rif";
import { CLAVE_AYUDA, CLAVE_ERROR, CLAVE_MINIMO, telefonoValido, TELEFONO_ERROR } from "@/lib/ve";
import { MSG } from "@/lib/errores";
import { TelefonoField } from "@/components/ve-fields";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { FieldGroup, Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

export type SesionOnboarding = { email: string; nombreSugerido?: string | null };

const CAMPOS_CUENTA: CampoRegistro[] = ["email", "password", "confirmPassword"];
const CAMPOS_ONBOARDING: CampoRegistro[] = ["nombre", "rif", "telefono", "representante", "mensaje"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENLACE = "font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline";
const MSG_EMAIL_USADO = "Ya existe una cuenta con este correo. Inicia sesión o usa otro correo.";

const ERROR_GOOGLE = {
  titulo: "No pudiste entrar con Google",
  detalle: "Intenta de nuevo o crea tu cuenta con correo y contraseña.",
};

type Errores = Partial<Record<CampoRegistro, string>>;

/** Sitio público de EnBus (términos y privacidad). Sin la variable, el enlace no se muestra. */
const SITIO_URL = (process.env.NEXT_PUBLIC_SITIO_URL ?? "").trim().replace(/\/+$/, "") || null;

/** Enfoca el campo por su ref o, si no la tiene (TelefonoField), por su id. */
function enfocarCampo(el: HTMLInputElement | HTMLTextAreaElement | null | undefined, campo: CampoRegistro) {
  (el ?? (document.getElementById(campo) as HTMLInputElement | null))?.focus();
}

function validarCuenta(d: { email: string; password: string; confirmPassword: string }): Errores {
  const e: Errores = {};
  if (!EMAIL_RE.test(d.email.trim())) e.email = "Escribe un correo válido, por ejemplo tu@correo.com.";
  if (d.password.length < CLAVE_MINIMO) e.password = CLAVE_ERROR;
  else if (d.password !== d.confirmPassword) e.confirmPassword = "Las contraseñas no coinciden.";
  return e;
}

function validarOnboarding(d: { nombre: string; rif: string; telefono: string; representante: string }): Errores {
  const e: Errores = {};
  if (d.nombre.trim().length < 3) e.nombre = "Escribe el nombre de tu cooperativa (mínimo 3 caracteres).";
  if (!normalizeRif(d.rif)) e.rif = RIF_AYUDA;
  if (!telefonoValido(d.telefono)) e.telefono = TELEFONO_ERROR;
  if (d.representante.trim().length < 3) e.representante = "Escribe el nombre y apellido del representante legal.";
  return e;
}

function tieneErroresCampo(errores?: Errores) {
  return Boolean(errores && Object.keys(errores).length > 0);
}

function PieLegal() {
  if (!SITIO_URL) return null;
  return (
    <p className="text-center text-[13px] text-muted-foreground">
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
  );
}

const ESTADO_INICIAL: ActionState = { error: null, success: false };

export default function RegistroCooperativaClient({
  sesionInicial,
  avisoInicial = null,
}: {
  sesionInicial: SesionOnboarding | null;
  avisoInicial?: "google" | null;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [sesionActual, setSesionActual] = useState<SesionOnboarding | null>(sesionInicial);
  const [prevSesionEmail, setPrevSesionEmail] = useState<string | null>(sesionInicial?.email ?? null);

  const [stateCuenta, actionCuenta, pendingCuenta] = useActionState<ActionState, FormData>(
    crearCuentaCooperativa,
    ESTADO_INICIAL
  );
  const [stateOnboarding, actionOnboarding, pendingOnboarding] = useActionState<ActionState, FormData>(
    completarOnboardingCooperativa,
    ESTADO_INICIAL
  );

  // Paso 1: cuenta de administrador
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [erroresCuenta, setErroresCuenta] = useState<Errores>({});
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<{ titulo: string; detalle: string } | null>(() =>
    avisoInicial === "google" ? ERROR_GOOGLE : null
  );

  // Paso 2: datos de la cooperativa (controlado para que un error del servidor no borre lo escrito)
  const [nombre, setNombre] = useState("");
  const [rif, setRif] = useState("");
  const [telefono, setTelefono] = useState("");
  const [representante, setRepresentante] = useState(sesionInicial?.nombreSugerido ?? "");
  const [mensaje, setMensaje] = useState("");
  const [erroresOnboarding, setErroresOnboarding] = useState<Errores>({});
  const [sesionExpiradaMsg, setSesionExpiradaMsg] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  const refs = useRef<Partial<Record<CampoRegistro, HTMLInputElement | HTMLTextAreaElement | null>>>({});

  // Sincroniza cambios de sesión venidos del servidor (p. ej. tras router.refresh()).
  const sesionInicialEmail = sesionInicial?.email ?? null;
  if (sesionInicialEmail !== prevSesionEmail) {
    setPrevSesionEmail(sesionInicialEmail);
    setSesionActual(sesionInicial);
    if (sesionInicial?.nombreSugerido && !representante) {
      setRepresentante(sesionInicial.nombreSugerido);
    }
  }

  // Respuesta nueva del paso 1: errores por campo o paso al onboarding.
  const [prevStateCuenta, setPrevStateCuenta] = useState(stateCuenta);
  if (stateCuenta !== prevStateCuenta) {
    setPrevStateCuenta(stateCuenta);
    setErroresCuenta(stateCuenta?.errores ?? {});
    setSesionExpiradaMsg(null);
    if (stateCuenta?.etapa === "onboarding") {
      setSesionActual({ email: stateCuenta.email ?? email, nombreSugerido: null });
      setErroresOnboarding({});
      setGoogleError(null);
    } else if (stateCuenta?.error) {
      setGoogleError(null);
    }
  }

  // Respuesta nueva del paso 2: errores por campo o vuelta al paso 1 si expiró la sesión.
  const [prevStateOnboarding, setPrevStateOnboarding] = useState(stateOnboarding);
  if (stateOnboarding !== prevStateOnboarding) {
    setPrevStateOnboarding(stateOnboarding);
    setErroresOnboarding(stateOnboarding?.errores ?? {});
    if (stateOnboarding?.etapa === "cuenta") {
      setSesionActual(null);
      setSesionExpiradaMsg(stateOnboarding.error ?? "Tu sesión expiró. Inicia sesión para continuar.");
    }
  }

  useEffect(() => {
    if (stateCuenta?.campo) {
      enfocarCampo(refs.current[stateCuenta.campo], stateCuenta.campo);
    } else if (stateCuenta?.etapa === "onboarding") {
      enfocarCampo(refs.current.nombre, "nombre");
    }
  }, [stateCuenta]);

  useEffect(() => {
    if (stateOnboarding?.campo) {
      enfocarCampo(refs.current[stateOnboarding.campo], stateOnboarding.campo);
    }
  }, [stateOnboarding]);

  const enOnboarding = Boolean(sesionActual);
  const ocupadoPaso1 = pendingCuenta || googleLoading;
  const ocupadoPaso2 = pendingOnboarding || saliendo;

  const errorGeneralCuenta =
    stateCuenta?.error && !tieneErroresCampo(stateCuenta?.errores) ? stateCuenta.error : null;
  const errorGeneralOnboarding =
    stateOnboarding?.error && !tieneErroresCampo(stateOnboarding?.errores) ? stateOnboarding.error : null;

  const alertaPaso1 = googleError
    ? { titulo: googleError.titulo, detalle: googleError.detalle, conLogin: false }
    : errorGeneralCuenta
      ? {
          titulo: stateCuenta?.success ? "Falta iniciar sesión" : "No pudimos crear tu cuenta",
          detalle: errorGeneralCuenta,
          conLogin: Boolean(stateCuenta?.success),
        }
      : sesionExpiradaMsg
        ? {
            titulo: "Tu sesión expiró",
            detalle: sesionExpiradaMsg,
            conLogin: true,
          }
        : null;

  const limpiarErrorCampo = (
    setErrores: React.Dispatch<React.SetStateAction<Errores>>,
    campo: CampoRegistro
  ) =>
    setErrores((prev) => {
      if (!prev[campo]) return prev;
      const siguiente = { ...prev };
      delete siguiente[campo];
      return siguiente;
    });

  const limpiarCuenta = (campo: CampoRegistro) => limpiarErrorCampo(setErroresCuenta, campo);
  const limpiarOnboarding = (campo: CampoRegistro) => limpiarErrorCampo(setErroresOnboarding, campo);

  const enfocar = (campo?: CampoRegistro) => {
    if (!campo) return;
    window.setTimeout(() => enfocarCampo(refs.current[campo], campo), 0);
  };

  function validarAntesDeCrearCuenta(e: FormEvent<HTMLFormElement>) {
    if (ocupadoPaso1) {
      e.preventDefault();
      return;
    }
    setGoogleError(null);
    setSesionExpiradaMsg(null);
    const encontrados = validarCuenta({ email, password, confirmPassword });
    if (Object.keys(encontrados).length > 0) {
      e.preventDefault();
      setErroresCuenta(encontrados);
      enfocar(CAMPOS_CUENTA.find((c) => encontrados[c]));
    }
  }

  function validarAntesDeOnboarding(e: FormEvent<HTMLFormElement>) {
    if (ocupadoPaso2) {
      e.preventDefault();
      return;
    }
    const encontrados = validarOnboarding({ nombre, rif, telefono, representante });
    if (Object.keys(encontrados).length > 0) {
      e.preventDefault();
      setErroresOnboarding(encontrados);
      enfocar(CAMPOS_ONBOARDING.find((c) => encontrados[c]));
    }
  }

  const handleGoogleSignIn = async () => {
    if (ocupadoPaso1) return;
    setGoogleLoading(true);
    setGoogleError(null);
    setSesionExpiradaMsg(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/cooperativas/auth/callback?next=/cooperativas/registro`,
        },
      });
      if (oauthError) {
        setGoogleError(ERROR_GOOGLE);
        setGoogleLoading(false);
      }
    } catch {
      setGoogleError(ERROR_GOOGLE);
      setGoogleLoading(false);
    }
  };

  const handleCambiarCuenta = async () => {
    if (ocupadoPaso2) return;
    setSaliendo(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Aunque falle la red, la sesión local del navegador se limpia abajo.
    } finally {
      setSesionActual(null);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setNombre("");
      setRif("");
      setTelefono("");
      setRepresentante("");
      setMensaje("");
      setErroresCuenta({});
      setErroresOnboarding({});
      setGoogleError(null);
      setSesionExpiradaMsg(null);
      setSaliendo(false);
      router.replace("/cooperativas/registro");
      router.refresh();
    }
  };

  const ayudaCuenta = (campo: CampoRegistro) => (erroresCuenta[campo] ? `${campo}-error` : undefined);
  const ayudaOnboarding = (campo: CampoRegistro) => (erroresOnboarding[campo] ? `${campo}-error` : undefined);
  const esCorreoDuplicado =
    erroresCuenta.email === MSG_EMAIL_USADO || erroresCuenta.email === MSG.cuentaExiste;

  return (
    <AuthLayout
      zona="cooperativas"
      titulo={enOnboarding ? "Datos de tu cooperativa" : "Registrar cooperativa"}
      descripcion={
        enOnboarding
          ? "Paso 2 de 2 · Completa la información para enviar tu solicitud"
          : "Paso 1 de 2 · Crea tu cuenta de administrador"
      }
      pie={
        !enOnboarding ? (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/cooperativas/login" className={ENLACE}>
              Inicia sesión
            </Link>
          </>
        ) : undefined
      }
    >
      {!enOnboarding ? (
        <div className="flex flex-col gap-6">
          {alertaPaso1 && (
            <Alert variant="destructive">
              <WarningCircle weight="fill" aria-hidden />
              <AlertTitle>{alertaPaso1.titulo}</AlertTitle>
              <AlertDescription>
                {alertaPaso1.detalle}
                {alertaPaso1.conLogin && (
                  <>
                    {" "}
                    <Link href="/cooperativas/login" className="font-medium underline underline-offset-4">
                      Ir a iniciar sesión
                    </Link>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          <form action={actionCuenta} onSubmit={validarAntesDeCrearCuenta} noValidate className="flex flex-col gap-6">
            <FieldGroup>
              <Field data-invalid={erroresCuenta.email ? true : undefined}>
                <FieldLabel htmlFor="email">Correo</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  ref={(el) => {
                    refs.current.email = el;
                  }}
                  type="email"
                  inputMode="email"
                  placeholder="Ej. tu@correo.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={erroresCuenta.email ? true : undefined}
                  aria-describedby={ayudaCuenta("email")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    limpiarCuenta("email");
                  }}
                  disabled={ocupadoPaso1}
                />
                {/* Condicional: con varios hijos FieldError se pinta aunque no haya error (alerta vacía). */}
                {erroresCuenta.email && (
                  <FieldError id="email-error">
                    {erroresCuenta.email}
                    {esCorreoDuplicado && (
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

              <Field data-invalid={erroresCuenta.password ? true : undefined}>
                <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                <PasswordInput
                  id="password"
                  name="password"
                  ref={(el) => {
                    refs.current.password = el;
                  }}
                  autoComplete="new-password"
                  aria-invalid={erroresCuenta.password ? true : undefined}
                  aria-describedby={erroresCuenta.password ? "password-error" : "password-ayuda"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    limpiarCuenta("password");
                  }}
                  disabled={ocupadoPaso1}
                />
                {erroresCuenta.password ? (
                  <FieldError id="password-error">{erroresCuenta.password}</FieldError>
                ) : (
                  <FieldDescription id="password-ayuda">{CLAVE_AYUDA}</FieldDescription>
                )}
              </Field>

              <Field data-invalid={erroresCuenta.confirmPassword ? true : undefined}>
                <FieldLabel htmlFor="confirmPassword">Repite la contraseña</FieldLabel>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  ref={(el) => {
                    refs.current.confirmPassword = el;
                  }}
                  autoComplete="new-password"
                  aria-invalid={erroresCuenta.confirmPassword ? true : undefined}
                  aria-describedby={ayudaCuenta("confirmPassword")}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    limpiarCuenta("confirmPassword");
                  }}
                  disabled={ocupadoPaso1}
                />
                <FieldError id="confirmPassword-error">{erroresCuenta.confirmPassword}</FieldError>
              </Field>
            </FieldGroup>

            <Button type="submit" size="lg" className="w-full" disabled={ocupadoPaso1} aria-busy={pendingCuenta || undefined}>
              {pendingCuenta && <Spinner size="sm" data-icon="inline-start" />}
              {pendingCuenta ? "Creando tu cuenta…" : "Continuar"}
              {!pendingCuenta && <ArrowRight aria-hidden />}
            </Button>
          </form>

          <div className="flex items-center gap-2" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="px-2 text-xs text-muted-foreground">o</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={ocupadoPaso1}
            aria-busy={googleLoading || undefined}
            className="w-full"
          >
            {googleLoading ? <Spinner size="sm" aria-hidden /> : <GoogleLogo aria-hidden />}
            Continuar con Google
          </Button>

          <PieLegal />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              Cuenta: <strong className="font-medium text-foreground">{sesionActual?.email || "Sesión activa"}</strong>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCambiarCuenta}
              disabled={ocupadoPaso2}
              aria-busy={saliendo || undefined}
              className="shrink-0"
            >
              {saliendo && <Spinner size="sm" data-icon="inline-start" />}
              Cambiar cuenta
            </Button>
          </div>

          {errorGeneralOnboarding && (
            <Alert variant="destructive">
              <WarningCircle weight="fill" aria-hidden />
              <AlertTitle>{stateOnboarding?.success ? "Falta iniciar sesión" : "No pudimos completar el registro"}</AlertTitle>
              <AlertDescription>
                {errorGeneralOnboarding}
                {stateOnboarding?.success && (
                  <>
                    {" "}
                    <Link href="/cooperativas/login" className="font-medium underline underline-offset-4">
                      Ir a iniciar sesión
                    </Link>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          <form
            action={actionOnboarding}
            onSubmit={validarAntesDeOnboarding}
            noValidate
            className="flex flex-col gap-6"
          >
            <FieldGroup>
              <Field data-invalid={erroresOnboarding.nombre ? true : undefined}>
                <FieldLabel htmlFor="nombre">Nombre de la cooperativa</FieldLabel>
                <Input
                  id="nombre"
                  name="nombre"
                  ref={(el) => {
                    refs.current.nombre = el;
                  }}
                  type="text"
                  placeholder="Ej.: Expresos Los Andes"
                  autoComplete="organization"
                  aria-invalid={erroresOnboarding.nombre ? true : undefined}
                  aria-describedby={ayudaOnboarding("nombre")}
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    limpiarOnboarding("nombre");
                  }}
                  disabled={ocupadoPaso2}
                />
                <FieldError id="nombre-error">{erroresOnboarding.nombre}</FieldError>
              </Field>

              <Field data-invalid={erroresOnboarding.rif ? true : undefined}>
                <FieldLabel htmlFor="rif">RIF de la cooperativa</FieldLabel>
                <Input
                  id="rif"
                  name="rif"
                  ref={(el) => {
                    refs.current.rif = el;
                  }}
                  type="text"
                  placeholder={RIF_PLACEHOLDER}
                  autoCapitalize="characters"
                  aria-invalid={erroresOnboarding.rif ? true : undefined}
                  aria-describedby={erroresOnboarding.rif ? "rif-error" : "rif-ayuda"}
                  value={rif}
                  onChange={(e) => {
                    setRif(e.target.value);
                    limpiarOnboarding("rif");
                  }}
                  onBlur={() => setRif((actual) => normalizeRif(actual) ?? actual)}
                  disabled={ocupadoPaso2}
                />
                {erroresOnboarding.rif ? (
                  <FieldError id="rif-error">{erroresOnboarding.rif}</FieldError>
                ) : (
                  <FieldDescription id="rif-ayuda">{RIF_AYUDA_CORTA}</FieldDescription>
                )}
              </Field>

              <TelefonoField
                id="telefono"
                name="telefono"
                label="Teléfono de contacto"
                value={telefono}
                onChange={(v) => {
                  setTelefono(v);
                  limpiarOnboarding("telefono");
                }}
                error={erroresOnboarding.telefono}
                required
                disabled={ocupadoPaso2}
              />

              <Field data-invalid={erroresOnboarding.representante ? true : undefined}>
                <FieldLabel htmlFor="representante">Representante legal</FieldLabel>
                <Input
                  id="representante"
                  name="representante"
                  ref={(el) => {
                    refs.current.representante = el;
                  }}
                  type="text"
                  placeholder="Ej.: Carlos Mendoza"
                  autoComplete="name"
                  aria-invalid={erroresOnboarding.representante ? true : undefined}
                  aria-describedby={ayudaOnboarding("representante")}
                  value={representante}
                  onChange={(e) => {
                    setRepresentante(e.target.value);
                    limpiarOnboarding("representante");
                  }}
                  disabled={ocupadoPaso2}
                />
                <FieldError id="representante-error">{erroresOnboarding.representante}</FieldError>
              </Field>

              <Field data-invalid={erroresOnboarding.mensaje ? true : undefined}>
                <FieldLabel htmlFor="mensaje">Rutas de interés (opcional)</FieldLabel>
                <Textarea
                  id="mensaje"
                  name="mensaje"
                  ref={(el) => {
                    refs.current.mensaje = el;
                  }}
                  rows={3}
                  maxLength={1000}
                  placeholder="Ej.: Caracas – Valencia"
                  aria-invalid={erroresOnboarding.mensaje ? true : undefined}
                  aria-describedby={ayudaOnboarding("mensaje")}
                  value={mensaje}
                  onChange={(e) => {
                    setMensaje(e.target.value);
                    limpiarOnboarding("mensaje");
                  }}
                  disabled={ocupadoPaso2}
                />
                <FieldError id="mensaje-error">{erroresOnboarding.mensaje}</FieldError>
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={ocupadoPaso2}
              aria-busy={pendingOnboarding || undefined}
            >
              {pendingOnboarding && <Spinner size="sm" data-icon="inline-start" />}
              {pendingOnboarding ? "Guardando datos…" : "Completar registro"}
            </Button>

            <PieLegal />
          </form>
        </div>
      )}
    </AuthLayout>
  );
}
