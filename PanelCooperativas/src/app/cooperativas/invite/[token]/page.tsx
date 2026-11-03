"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { completeOnboarding, validateInviteToken } from "./actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/error-state";
import { humanizeError } from "@/lib/errores";
import { Bus, LinkBreak, WarningCircle, WifiSlash } from "@phosphor-icons/react";

type EstadoToken =
  | { tipo: "cargando" }
  | { tipo: "valida"; email: string; cooperativa: string | null }
  | { tipo: "invalida"; mensaje: string }
  | { tipo: "error"; mensaje: string };

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;

  const [estado, setEstado] = useState<EstadoToken>({ tipo: "cargando" });
  const [sinConexion, setSinConexion] = useState(false);
  // Campos controlados: si el servidor responde con un error (p. ej. contraseña débil),
  // React 19 reinicia el formulario de una acción; así lo escrito se conserva.
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [state, formAction, isPending] = useActionState(completeOnboarding, { error: null as string | null, success: false });

  const revisarToken = useCallback(async () => {
    try {
      const res = await validateInviteToken(token);
      if (res.error) {
        setEstado("invalida" in res && res.invalida ? { tipo: "invalida", mensaje: res.error } : { tipo: "error", mensaje: res.error });
      } else {
        setEstado({ tipo: "valida", email: res.email ?? "", cooperativa: res.cooperativa_nombre ?? null });
      }
    } catch (err) {
      setEstado({ tipo: "error", mensaje: humanizeError(err, "revisar la invitación") });
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void revisarToken();
  }, [revisarToken]);

  if (estado.tipo === "cargando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40" role="status">
        <Spinner className="size-8" />
        <span className="sr-only">Revisando la invitación…</span>
      </div>
    );
  }

  if (estado.tipo === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-md">
          <ErrorState titulo="No pudimos revisar tu invitación" descripcion={estado.mensaje} onReintentar={revisarToken} />
        </Card>
      </div>
    );
  }

  if (estado.tipo === "invalida") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-4 flex justify-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
                <LinkBreak className="size-7 text-destructive-text" weight="duotone" aria-hidden />
              </div>
            </div>
            <CardTitle className="text-center text-2xl">Esta invitación ya no sirve</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-center text-muted-foreground">{estado.mensaje}</p>
            <Link href="/cooperativas/login" className={buttonVariants({ variant: "default", className: "w-full" })}>
              Ir a iniciar sesión
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Panel izquierdo decorativo (siempre oscuro) */}
      <div className="hidden w-3/5 flex-col justify-between dark bg-background p-12 text-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
            <Bus weight="fill" className="size-6 text-primary-foreground" aria-hidden />
          </div>
          <span className="text-xl font-bold tracking-tight">EnBus</span>
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-bold leading-tight">
            Bienvenido a <br />
            <span className="text-primary">{estado.cooperativa || "tu cooperativa"}</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Crea tu cuenta para entrar al panel de la cooperativa.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} EnBus. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel derecho */}
      <div className="flex w-full items-center justify-center bg-muted/40 p-6 lg:w-2/5 lg:bg-background">
        <Card className="w-full max-w-md border-0 bg-transparent shadow-none lg:border lg:bg-card lg:shadow-sm">
          <CardHeader>
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary">
                <Bus weight="fill" className="size-8 text-primary-foreground" aria-hidden />
              </div>
            </div>
            <CardTitle className="text-2xl">Crea tu cuenta</CardTitle>
            <CardDescription>
              Completa tus datos para unirte a {estado.cooperativa || "la cooperativa"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={formAction}
              onSubmit={(e) => {
                if (!navigator.onLine) {
                  e.preventDefault();
                  setSinConexion(true);
                  return;
                }
                setSinConexion(false);
              }}
              className="flex flex-col gap-6"
            >
              <input type="hidden" name="token" value={token} />

              {sinConexion && (
                <Alert variant="destructive">
                  <WifiSlash className="size-4" data-icon="inline-start" aria-hidden />
                  <AlertTitle>Sin conexión</AlertTitle>
                  <AlertDescription>Revisa tu internet e intenta de nuevo. Lo que escribiste se mantiene.</AlertDescription>
                </Alert>
              )}

              {state?.error && !sinConexion && (
                <Alert variant="destructive">
                  <WarningCircle className="size-4" data-icon="inline-start" aria-hidden />
                  <AlertTitle>No pudimos crear tu cuenta</AlertTitle>
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Correo</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={estado.email}
                    readOnly
                    className="bg-muted text-muted-foreground"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="nombre">Nombre y apellido</FieldLabel>
                  <Input
                    id="nombre"
                    name="nombre"
                    type="text"
                    placeholder="Ej.: Juan Pérez"
                    autoComplete="name"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    disabled={isPending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isPending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword">Repite la contraseña</FieldLabel>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isPending}
                  />
                </Field>
              </FieldGroup>

              <Button type="submit" className="w-full" disabled={isPending} aria-busy={isPending || undefined}>
                {isPending ? <Spinner data-icon="inline-start" /> : null}
                {isPending ? "Creando tu cuenta…" : "Crear cuenta"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
