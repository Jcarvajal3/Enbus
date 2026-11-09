"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { completeOnboarding, validateInviteToken } from "./actions";
import { AuthLayout } from "@/components/auth-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/error-state";
import { humanizeError } from "@/lib/errores";
import { CLAVE_AYUDA, CLAVE_MINIMO } from "@/lib/ve";
import { WarningCircle, WifiSlash } from "@phosphor-icons/react";

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
      <AuthLayout zona="cooperativas" titulo="Crea tu cuenta">
        <div role="status" aria-label="Revisando la invitación" className="flex flex-col gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-full rounded-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-full rounded-full" />
        </div>
      </AuthLayout>
    );
  }

  if (estado.tipo === "error") {
    return (
      <AuthLayout zona="cooperativas" titulo="Crea tu cuenta">
        <ErrorState compacto titulo="No pudimos revisar tu invitación" descripcion={estado.mensaje} onReintentar={revisarToken} />
      </AuthLayout>
    );
  }

  if (estado.tipo === "invalida") {
    return (
      <AuthLayout zona="cooperativas" titulo="Esta invitación ya no sirve" descripcion={estado.mensaje}>
        <Link href="/cooperativas/login" className={buttonVariants({ className: "w-full" })}>
          Ir a iniciar sesión
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      zona="cooperativas"
      titulo="Crea tu cuenta"
      descripcion={`Te unes a ${estado.cooperativa || "tu cooperativa"}.`}
    >
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
            <WifiSlash weight="fill" aria-hidden />
            <AlertTitle>Sin conexión</AlertTitle>
            <AlertDescription>Revisa tu internet e intenta de nuevo. Lo que escribiste se mantiene.</AlertDescription>
          </Alert>
        )}

        {state?.error && !sinConexion && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
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
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={CLAVE_MINIMO}
              aria-describedby="password-ayuda"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
            />
            <FieldDescription id="password-ayuda">{CLAVE_AYUDA}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword">Repite la contraseña</FieldLabel>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength={CLAVE_MINIMO}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isPending}
            />
          </Field>
        </FieldGroup>

        <Button type="submit" className="w-full" disabled={isPending} aria-busy={isPending || undefined}>
          {isPending && <Spinner size="sm" data-icon="inline-start" />}
          {isPending ? "Creando tu cuenta…" : "Crear cuenta"}
        </Button>
      </form>
    </AuthLayout>
  );
}
