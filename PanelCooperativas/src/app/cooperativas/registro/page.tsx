"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { registrarCooperativa, verificarCorreoRegistro, type ActionState, type CampoRegistro } from "./actions";
import { normalizeRif, RIF_AYUDA, RIF_PLACEHOLDER } from "@/lib/rif";
import { telefonoValido, TELEFONO_ERROR, TELEFONO_PLACEHOLDER } from "@/lib/ve";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldGroup, Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Bus, WarningCircle, CheckCircle, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

// Campos del paso 1: si el servidor rechaza alguno, se vuelve a ese paso para corregirlo.
const CAMPOS_PASO_1: CampoRegistro[] = ["nombre", "email", "password", "confirmPassword"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MSG_EMAIL_USADO = "Ya existe una cuenta con este correo. Inicia sesión o usa otro correo.";

type Errores = Partial<Record<CampoRegistro, string>>;

/** Mismas reglas que el servidor (registro/actions.ts). */
function validarPaso1(d: { nombre: string; email: string; password: string; confirmPassword: string }): Errores {
  const e: Errores = {};
  if (d.nombre.trim().length < 3) e.nombre = "Escribe el nombre de tu cooperativa (mínimo 3 caracteres).";
  if (!EMAIL_RE.test(d.email.trim())) e.email = "Escribe un correo válido, por ejemplo contacto@tucooperativa.com.";
  if (d.password.length < 8) e.password = "La contraseña debe tener al menos 8 caracteres.";
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
    window.setTimeout(() => refs.current[campo]?.focus(), 0);
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
    if (state?.campo) refs.current[state.campo]?.focus();
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
      const { registrado } = await verificarCorreoRegistro(email);
      if (registrado) {
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
    <div className="flex min-h-screen">
      {/* Panel izquierdo decorativo (siempre oscuro) */}
      <div className="hidden w-3/5 flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
            <Bus weight="fill" className="size-6 text-primary-foreground" aria-hidden />
          </div>
          <span className="text-xl font-bold tracking-tight">EnBus</span>
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-bold leading-tight">
            Registra tu <br />
            <span className="text-amber-300">cooperativa</span>
          </h1>
          <p className="text-xl text-slate-300">
            Configura tu panel mientras revisamos tu solicitud (24 a 48 horas hábiles).
          </p>
          <ul className="mt-6 space-y-3 text-slate-300">
            <li className="flex items-start gap-3">
              <CheckCircle className="size-5 text-amber-300 shrink-0 mt-0.5" weight="fill" aria-hidden />
              <span>Entras al panel apenas creas tu cuenta</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="size-5 text-amber-300 shrink-0 mt-0.5" weight="fill" aria-hidden />
              <span>Carga tus sucursales, rutas, métodos de pago y taquilleros</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="size-5 text-amber-300 shrink-0 mt-0.5" weight="fill" aria-hidden />
              <span>Tus viajes aparecen en la app cuando aprobemos tu solicitud</span>
            </li>
          </ul>
        </div>

        <p className="text-sm text-slate-400">
          &copy; {new Date().getFullYear()} EnBus. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel derecho con el formulario */}
      <div className="flex w-full items-center justify-center p-6 lg:w-2/5 overflow-y-auto">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary">
                <Bus weight="fill" className="size-8 text-primary-foreground" aria-hidden />
              </div>
            </div>
            <CardTitle className="text-2xl">Registro de cooperativa</CardTitle>
            <CardDescription>
              {step === 1
                ? "Paso 1 de 2 · Crea tu cuenta de administrador"
                : "Paso 2 de 2 · Datos de tu cooperativa"}
            </CardDescription>
            <p className="text-sm text-muted-foreground lg:hidden">
              Configura tu panel mientras revisamos tu solicitud (24 a 48 horas hábiles).
            </p>
            {/* Indicador de pasos */}
            <div className="flex items-center gap-2 pt-2" aria-hidden>
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
            </div>
          </CardHeader>
          <CardContent>
            {errorGeneral && (
              <Alert variant="destructive" className="mb-6">
                <WarningCircle className="size-4" data-icon="inline-start" aria-hidden />
                <AlertTitle>{state?.success ? "Falta iniciar sesión" : "No pudimos completar el registro"}</AlertTitle>
                <AlertDescription>
                  {errorGeneral}
                  {state?.success && (
                    <>
                      {" "}
                      <Link href="/cooperativas/login" className="font-medium text-primary-text underline underline-offset-4">
                        Ir a iniciar sesión
                      </Link>
                    </>
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
                      placeholder="Ej.: Cooperativa de Transporte Los Andes"
                      autoComplete="organization"
                      aria-invalid={errores.nombre ? true : undefined}
                      aria-describedby={ayuda("nombre")}
                      value={nombre}
                      onChange={(e) => { setNombre(e.target.value); limpiar("nombre"); }}
                      disabled={verificandoCorreo}
                    />
                    <FieldError id="nombre-error" className="text-destructive-text">{errores.nombre}</FieldError>
                  </Field>

                  <Field data-invalid={errores.email ? true : undefined}>
                    <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
                    <Input
                      id="email"
                      ref={(el) => { refs.current.email = el; }}
                      type="email"
                      placeholder="contacto@tucooperativa.com"
                      autoComplete="email"
                      aria-invalid={errores.email ? true : undefined}
                      aria-describedby={ayuda("email")}
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); limpiar("email"); }}
                      disabled={verificandoCorreo}
                    />
                    {/* Condicional: con varios hijos FieldError se pinta aunque no haya error (alerta vacía). */}
                    {errores.email && (
                      <FieldError id="email-error" className="text-destructive-text">
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
                    <Input
                      id="password"
                      ref={(el) => { refs.current.password = el; }}
                      type="password"
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      aria-invalid={errores.password ? true : undefined}
                      aria-describedby={ayuda("password")}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); limpiar("password"); }}
                      disabled={verificandoCorreo}
                    />
                    <FieldError id="password-error" className="text-destructive-text">{errores.password}</FieldError>
                  </Field>

                  <Field data-invalid={errores.confirmPassword ? true : undefined}>
                    <FieldLabel htmlFor="confirmPassword">Repite la contraseña</FieldLabel>
                    <Input
                      id="confirmPassword"
                      ref={(el) => { refs.current.confirmPassword = el; }}
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={errores.confirmPassword ? true : undefined}
                      aria-describedby={ayuda("confirmPassword")}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); limpiar("confirmPassword"); }}
                      disabled={verificandoCorreo}
                    />
                    <FieldError id="confirmPassword-error" className="text-destructive-text">{errores.confirmPassword}</FieldError>
                  </Field>
                </FieldGroup>

                <Button type="submit" className="w-full" disabled={verificandoCorreo} aria-busy={verificandoCorreo || undefined}>
                  {verificandoCorreo ? <Spinner data-icon="inline-start" /> : null}
                  {verificandoCorreo ? "Verificando el correo…" : "Continuar"}
                  {!verificandoCorreo && <ArrowRight className="size-4" weight="bold" aria-hidden />}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  ¿Ya tienes cuenta?{" "}
                  <Link href="/cooperativas/login" className="font-medium text-primary-text underline-offset-4 hover:underline">
                    Inicia sesión
                  </Link>
                </p>
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
                      <FieldError id="rif-error" className="text-destructive-text">{errores.rif}</FieldError>
                    ) : (
                      <FieldDescription id="rif-ayuda" className="text-xs">{RIF_AYUDA}</FieldDescription>
                    )}
                  </Field>

                  <Field data-invalid={errores.telefono ? true : undefined}>
                    <FieldLabel htmlFor="telefono">Teléfono de contacto</FieldLabel>
                    <Input
                      id="telefono"
                      ref={(el) => { refs.current.telefono = el; }}
                      name="telefono"
                      type="tel"
                      placeholder={TELEFONO_PLACEHOLDER}
                      autoComplete="tel"
                      aria-invalid={errores.telefono ? true : undefined}
                      aria-describedby={ayuda("telefono")}
                      value={telefono}
                      onChange={(e) => { setTelefono(e.target.value); limpiar("telefono"); }}
                      disabled={isPending}
                    />
                    <FieldError id="telefono-error" className="text-destructive-text">{errores.telefono}</FieldError>
                  </Field>

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
                    <FieldError id="representante-error" className="text-destructive-text">{errores.representante}</FieldError>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="mensaje">Mensaje o rutas de interés (opcional)</FieldLabel>
                    <Textarea
                      id="mensaje"
                      ref={(el) => { refs.current.mensaje = el; }}
                      name="mensaje"
                      rows={3}
                      maxLength={1000}
                      placeholder="Ej.: Cubrimos Caracas – Valencia y Caracas – Maracay."
                      value={mensaje}
                      onChange={(e) => setMensaje(e.target.value)}
                      disabled={isPending}
                    />
                  </Field>
                </FieldGroup>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setErrores({});
                      setStep(1);
                    }}
                    disabled={isPending}
                  >
                    <ArrowLeft className="size-4" weight="bold" aria-hidden />
                    Atrás
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isPending} aria-busy={isPending || undefined}>
                    {isPending ? <Spinner data-icon="inline-start" /> : null}
                    {isPending ? "Creando tu cuenta…" : "Crear cuenta y registrar"}
                  </Button>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  ¿Ya tienes cuenta?{" "}
                  <Link href="/cooperativas/login" className="font-medium text-primary-text underline-offset-4 hover:underline">
                    Inicia sesión
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
