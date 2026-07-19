"use client";

import { useState, useActionState } from "react";
import { registrarCooperativa } from "./actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Bus, WarningCircle, CheckCircle, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

export default function RegistroCooperativaPage() {
  const [step, setStep] = useState(1);
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(registrarCooperativa, { error: null, success: false });

  // Step 1 local state
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function handleNextStep() {
    setClientError(null);

    if (!nombre.trim()) {
      setClientError("El nombre comercial es requerido.");
      return;
    }
    if (!email.trim()) {
      setClientError("El correo electrónico es requerido.");
      return;
    }
    if (!password) {
      setClientError("La contraseña es requerida.");
      return;
    }
    if (password.length < 8) {
      setClientError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setClientError("Las contraseñas no coinciden.");
      return;
    }

    setStep(2);
  }

  const displayError = clientError || state?.error;

  return (
    <div className="flex min-h-screen">
      {/* Panel Izquierdo Decorativo */}
      <div className="hidden w-3/5 flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
            <Bus weight="fill" className="size-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">EnBus</span>
        </div>
        
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-bold leading-tight">
            Registra tu <br />
            <span className="text-primary">Cooperativa</span>
          </h1>
          <p className="text-xl text-slate-400">
            Únete a la red de transporte digital más grande de Venezuela.
          </p>
          <div className="mt-6 space-y-3 text-slate-400">
            <div className="flex items-start gap-3">
              <CheckCircle className="size-5 text-primary shrink-0 mt-0.5" weight="fill" />
              <span>Acceso inmediato al panel para configurar tu operación</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="size-5 text-primary shrink-0 mt-0.5" weight="fill" />
              <span>Gestiona sucursales, rutas, conductores y taquilleros</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="size-5 text-primary shrink-0 mt-0.5" weight="fill" />
              <span>Tus viajes serán visibles en la app una vez aprobada tu solicitud</span>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-slate-500">
          &copy; {new Date().getFullYear()} EnBus. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel Derecho con Formulario */}
      <div className="flex w-full items-center justify-center p-6 lg:w-2/5 overflow-y-auto">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary">
                <Bus weight="fill" className="size-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Registro de Cooperativa</CardTitle>
            <CardDescription>
              {step === 1
                ? "Crea tu cuenta de administrador"
                : "Completa los datos de tu cooperativa"
              }
            </CardDescription>
            {/* Step indicator */}
            <div className="flex items-center gap-2 pt-2">
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
            </div>
          </CardHeader>
          <CardContent>
            {/* Step 1: Account info */}
            {step === 1 && (
              <div className="flex flex-col gap-6">
                {displayError && (
                  <Alert variant="destructive">
                    <WarningCircle className="size-4" data-icon="inline-start" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{displayError}</AlertDescription>
                  </Alert>
                )}

                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="nombre">Nombre Comercial</FieldLabel>
                    <Input
                      id="nombre"
                      type="text"
                      placeholder="Ej. Cooperativa de Transporte Panas"
                      required
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="email">Correo Electrónico</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="contacto@tucooperativa.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Mínimo 8 caracteres"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="confirmPassword">Confirmar Contraseña</FieldLabel>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Repite tu contraseña"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </Field>
                </FieldGroup>

                <Button type="button" className="w-full cursor-pointer" onClick={handleNextStep}>
                  Continuar
                  <ArrowRight className="size-4" weight="bold" />
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  ¿Ya tienes cuenta?{" "}
                  <Link href="/cooperativas/login" className="font-medium text-primary hover:underline">
                    Inicia sesión aquí
                  </Link>
                </p>
              </div>
            )}

            {/* Step 2: Cooperativa details */}
            {step === 2 && (
              <form action={formAction} className="flex flex-col gap-6">
                {/* Hidden fields from step 1 */}
                <input type="hidden" name="nombre" value={nombre} />
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="password" value={password} />
                <input type="hidden" name="confirmPassword" value={confirmPassword} />

                {state?.error && (
                  <Alert variant="destructive">
                    <WarningCircle className="size-4" data-icon="inline-start" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{state.error}</AlertDescription>
                  </Alert>
                )}

                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="rif">RIF</FieldLabel>
                    <Input
                      id="rif"
                      name="rif"
                      type="text"
                      placeholder="J-12345678"
                      required
                      pattern="^J-\d{8,9}$"
                      title="Formato: J-12345678"
                      disabled={isPending}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Formato: J-12345678</p>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="telefono">Teléfono</FieldLabel>
                    <Input
                      id="telefono"
                      name="telefono"
                      type="tel"
                      placeholder="0412-1234567"
                      required
                      disabled={isPending}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="representante">Representante Legal</FieldLabel>
                    <Input
                      id="representante"
                      name="representante"
                      type="text"
                      placeholder="Ej. Carlos Mendoza"
                      required
                      disabled={isPending}
                    />
                  </Field>
                </FieldGroup>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => setStep(1)}
                    disabled={isPending}
                  >
                    <ArrowLeft className="size-4" weight="bold" />
                    Atrás
                  </Button>
                  <Button type="submit" className="flex-1 cursor-pointer" disabled={isPending}>
                    {isPending ? <Spinner data-icon="inline-start" /> : null}
                    Crear Cuenta y Registrar
                  </Button>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  ¿Ya tienes cuenta?{" "}
                  <Link href="/cooperativas/login" className="font-medium text-primary hover:underline">
                    Inicia sesión aquí
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
