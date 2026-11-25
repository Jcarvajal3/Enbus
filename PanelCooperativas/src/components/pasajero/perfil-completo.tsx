"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react";
import { CedulaField, TelefonoField } from "@/components/campos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { completarPerfil } from "@/lib/pasajero/acciones-perfil";
import { cedulaValida, CEDULA_ERROR, LETRAS_PASAJERO, telefonoValido, TELEFONO_ERROR } from "@/lib/ve";

interface Props {
  /** Se llama cuando los datos quedaron guardados (después de `router.refresh()`). */
  onListo?: () => void;
  /** Cédula o teléfono que ya tiene el perfil, para no pedirlos de cero. */
  cedulaInicial?: string | null;
  telefonoInicial?: string | null;
  /** Para qué se piden: boletos (por defecto) o encomiendas. Solo cambia el texto de apoyo. */
  contexto?: "boleto" | "envio";
}

/**
 * Pide en línea la cédula y el teléfono que exige reservar asientos, sin sacar a la persona
 * del flujo. Guarda en `profiles` (server action) y refresca la ruta.
 */
export function PerfilCompleto({ onListo, cedulaInicial, telefonoInicial, contexto = "boleto" }: Props) {
  const router = useRouter();
  const [cedula, setCedula] = useState(cedulaInicial ?? "");
  const [telefono, setTelefono] = useState(telefonoInicial ?? "");
  const [errores, setErrores] = useState<{ cedula?: string; telefono?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (pendiente) return;
    const faltas = {
      ...(cedulaValida(cedula) ? {} : { cedula: CEDULA_ERROR }),
      ...(telefonoValido(telefono) ? {} : { telefono: TELEFONO_ERROR }),
    };
    setErrores(faltas);
    setError(null);
    if (faltas.cedula || faltas.telefono) return;

    empezar(async () => {
      try {
        const r = await completarPerfil({ cedula, telefono });
        if (!r.ok) {
          setError(r.error);
          if (r.campos) setErrores(r.campos);
          return;
        }
        router.refresh();
        onListo?.();
      } catch {
        setError("No pudimos guardar tus datos. Revisa tu conexión e intenta de nuevo.");
      }
    });
  };

  return (
    <form onSubmit={enviar} noValidate aria-labelledby="perfil-completo-titulo" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="perfil-completo-titulo" className="text-lg font-semibold">
          Completa tus datos
        </h2>
        <p className="text-sm text-muted-foreground">
          {contexto === "envio"
            ? "Los pedimos una sola vez. Los usamos para identificarte al entregar el paquete."
            : "Los pedimos una sola vez: van en tus boletos y los revisa el conductor al abordar."}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" aria-live="polite">
          <WarningCircle weight="fill" aria-hidden />
          <AlertTitle>No pudimos guardar tus datos</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <CedulaField
        id="perfil-cedula"
        value={cedula}
        onChange={(v) => {
          setCedula(v);
          setErrores((p) => ({ ...p, cedula: undefined }));
        }}
        letras={LETRAS_PASAJERO}
        error={errores.cedula}
        autoComplete="off"
        enterKeyHint="next"
        disabled={pendiente}
        required
      />
      <TelefonoField
        id="perfil-telefono"
        value={telefono}
        onChange={(v) => {
          setTelefono(v);
          setErrores((p) => ({ ...p, telefono: undefined }));
        }}
        error={errores.telefono}
        autoComplete="tel"
        enterKeyHint="done"
        disabled={pendiente}
        required
      />

      <Button type="submit" size="lg" className="w-full" disabled={pendiente} aria-busy={pendiente || undefined}>
        {pendiente && <Spinner size="sm" aria-hidden />}
        {pendiente ? "Guardando…" : "Guardar y continuar"}
      </Button>
    </form>
  );
}
