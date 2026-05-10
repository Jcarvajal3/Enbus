"use client";

import { useActionState, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { completeOnboarding, validateInviteToken } from "./actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Bus, WarningCircle } from "@phosphor-icons/react";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;
  
  const [inviteData, setInviteData] = useState<{ email?: string; cooperativa_nombre?: string } | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState(completeOnboarding, { error: null as string | null, success: false });

  useEffect(() => {
    async function checkToken() {
      const res = await validateInviteToken(token);
      if (res.error) {
        setTokenError(res.error);
      } else {
        setInviteData({ email: res.email, cooperativa_nombre: res.cooperativa_nombre });
      }
      setLoadingToken(false);
    }
    checkToken();
  }, [token]);

  if (loadingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-4 flex justify-center">
              <div className="flex size-12 items-center justify-center rounded-lg bg-destructive">
                <WarningCircle className="size-8 text-destructive-foreground" weight="fill" />
              </div>
            </div>
            <CardTitle className="text-center text-2xl">Invitación Inválida</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">{tokenError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Panel Izquierdo */}
      <div className="hidden w-3/5 flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
            <Bus weight="fill" className="size-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">EnBus</span>
        </div>
        
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-bold leading-tight">
            Bienvenido a <br />
            <span className="text-primary">{inviteData?.cooperativa_nombre || "Tu Cooperativa"}</span>
          </h1>
          <p className="text-xl text-slate-400">
            Completa tu registro para acceder al panel de gestión.
          </p>
        </div>
        
        <p className="text-sm text-slate-500">
          &copy; {new Date().getFullYear()} EnBus. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel Derecho */}
      <div className="flex w-full items-center justify-center bg-slate-50 p-6 lg:w-2/5 lg:bg-background">
        <Card className="w-full max-w-md border-0 bg-transparent shadow-none lg:border lg:bg-card lg:shadow-sm">
          <CardHeader>
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary">
                <Bus weight="fill" className="size-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Registro</CardTitle>
            <CardDescription>
              Completa tus datos para unirte a {inviteData?.cooperativa_nombre || "la cooperativa"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="flex flex-col gap-6">
              <input type="hidden" name="token" value={token} />
              
              {state?.error && (
                <Alert variant="destructive">
                  <WarningCircle className="size-4" data-icon="inline-start" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}
              
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input 
                    id="email" 
                    name="email"
                    type="email" 
                    value={inviteData?.email || ""} 
                    readOnly
                    className="bg-muted text-muted-foreground"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="nombre">Nombre Completo</FieldLabel>
                  <Input 
                    id="nombre" 
                    name="nombre"
                    type="text" 
                    placeholder="Ej. Juan Pérez" 
                    required 
                    disabled={isPending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                  <Input 
                    id="password" 
                    name="password"
                    type="password" 
                    required 
                    minLength={8}
                    disabled={isPending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword">Confirmar Contraseña</FieldLabel>
                  <Input 
                    id="confirmPassword" 
                    name="confirmPassword"
                    type="password" 
                    required 
                    minLength={8}
                    disabled={isPending}
                  />
                </Field>
              </FieldGroup>
              
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? <Spinner data-icon="inline-start" /> : null}
                Crear Cuenta
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
