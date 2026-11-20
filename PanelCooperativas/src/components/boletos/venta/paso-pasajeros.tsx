"use client";

// ─── Paso 3: ¿Quién viaja? ───────────────────────────────────────────────────
// Una tarjeta "Asiento N" por asiento (como `PasajerosForm` de la app): nombre y
// apellido, cédula con letra (V, E o P) y teléfono opcional. Los datos viven en la
// venta; el botón "Continuar" de la barra envía el <form id={ID_FORM_PASAJEROS}>.
// Al intentar continuar con errores se muestran bajo cada campo y el foco va al
// primero con error.

import { useEffect, useRef, type FormEvent } from "react";
import { UserCircleIcon } from "@phosphor-icons/react";
import { Campo, CedulaField, TelefonoField } from "@/components/campos";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/icon-tile";
import { LETRAS_PASAJERO } from "@/lib/ve";
import { cn } from "@/lib/utils";
import { PASAJERO_VACIO, erroresPasajero, type DatosPasajero } from "./tipos";

export const ID_FORM_PASAJEROS = "venta-pasajeros";

const idCampo = (asiento: string, campo: keyof DatosPasajero) => `pasajero-${asiento}-${campo}`;

export function PasoPasajeros({
  asientos,
  pasajeros,
  intento,
  focoToken,
  onEditar,
  onEnviar,
  bloqueado,
}: {
  asientos: string[];
  pasajeros: Record<string, DatosPasajero>;
  /** Ya se intentó continuar: se muestran los errores. */
  intento: boolean;
  /** Cambia cuando hay que llevar el foco al primer campo con error. */
  focoToken: number;
  onEditar: (asiento: string, campo: keyof DatosPasajero, valor: string) => void;
  onEnviar: () => void;
  bloqueado: boolean;
}) {
  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    if (!bloqueado) onEnviar();
  };

  // Foco al primer campo con error (tras un intento fallido, local o del servidor).
  useEffect(() => {
    if (focoToken === 0) return;
    for (const asiento of asientos) {
      const e = erroresPasajero(pasajeros[asiento]);
      const campo = e.nombre ? "nombre" : e.cedula ? "cedula" : e.telefono ? "telefono" : null;
      if (campo) {
        document.getElementById(idCampo(asiento, campo))?.focus();
        return;
      }
    }
    // Solo cuando llega un nuevo intento: no debe robar el foco mientras se escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoToken]);

  return (
    <form id={ID_FORM_PASAJEROS} onSubmit={alEnviar} noValidate className="flex flex-col gap-4">
      {asientos.map((asiento, i) => {
        const p = pasajeros[asiento] ?? PASAJERO_VACIO;
        const errores = erroresPasajero(p);
        const mostrar = intento ? errores : { nombre: null, cedula: null, telefono: null };
        const conError = Boolean(mostrar.nombre || mostrar.cedula || mostrar.telefono);
        const ultimo = i === asientos.length - 1;
        return (
          <TarjetaPasajero key={asiento} asiento={asiento} conError={conError}>
            <Campo
              id={idCampo(asiento, "nombre")}
              label="Nombre y apellido"
              placeholder="Ej. María Pérez"
              value={p.nombre}
              onChange={(v) => onEditar(asiento, "nombre", v)}
              error={mostrar.nombre}
              maxLength={120}
              enterKeyHint="next"
              disabled={bloqueado}
            />
            <CedulaField
              id={idCampo(asiento, "cedula")}
              label="Cédula"
              value={p.cedula}
              onChange={(v) => onEditar(asiento, "cedula", v)}
              error={mostrar.cedula}
              ayuda={i === 0 ? "Un menor sin cédula usa la de su representante." : undefined}
              letras={LETRAS_PASAJERO}
              enterKeyHint="next"
              disabled={bloqueado}
            />
            <TelefonoField
              id={idCampo(asiento, "telefono")}
              label="Teléfono"
              opcional
              value={p.telefono}
              onChange={(v) => onEditar(asiento, "telefono", v)}
              error={mostrar.telefono}
              enterKeyHint={ultimo ? "done" : "next"}
              disabled={bloqueado}
            />
          </TarjetaPasajero>
        );
      })}
    </form>
  );
}

function TarjetaPasajero({
  asiento,
  conError,
  children,
}: {
  asiento: string;
  conError: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLFieldSetElement>(null);

  // Mayúscula en cada palabra del nombre en el teclado del móvil (el campo genérico no lo expone).
  useEffect(() => {
    ref.current?.querySelector(`#${CSS.escape(idCampo(asiento, "nombre"))}`)?.setAttribute("autocapitalize", "words");
  }, [asiento]);

  return (
    <Card
      className={cn(
        "gap-5 border-2 border-transparent p-5 py-5 motion-safe:transition-colors",
        conError && "border-destructive-text"
      )}
    >
      <fieldset ref={ref} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
        <legend className="mb-4 flex items-center gap-3 p-0">
          <IconTile icon={UserCircleIcon} tone="sky" />
          <span className="text-[17px] font-semibold">Asiento {asiento}</span>
        </legend>
        {children}
      </fieldset>
    </Card>
  );
}
