"use client";

// ─── Paso 2: ¿quién viaja? ───────────────────────────────────────────────────
// Una tarjeta "Asiento N" por asiento, igual que en la taquilla (`boletos/venta/paso-pasajeros`): nombre y
// apellido, cédula (V, E o P) y teléfono opcional, con los mismos campos y reglas que la app. "Soy yo"
// rellena con el perfil y las sugerencias traen a quienes ya viajaron contigo. El botón de la barra
// envía el <form>; al intentar continuar con errores el foco va al primer campo con error.

import { useEffect, type FormEvent, type ReactNode } from "react";
import { ClockCounterClockwiseIcon, UserCircleIcon } from "@phosphor-icons/react";
import { AvisoError } from "@/components/aviso-error";
import { Campo, CedulaField, TelefonoField } from "@/components/campos";
import { IconTile } from "@/components/icon-tile";
import { Card } from "@/components/ui/card";
import { PASAJERO_VACIO, erroresPasajero, type DatosPasajero } from "@/components/boletos/venta/tipos";
import { cn } from "@/lib/utils";
import { formatCedula, LETRAS_PASAJERO } from "@/lib/ve";
import type { SugerenciaPasajero } from "./tipos";
import s from "./compra.module.css";

export const ID_FORM_PASAJEROS = "compra-pasajeros";

const idCampo = (asiento: string, campo: keyof DatosPasajero) => `pasajero-${asiento}-${campo}`;

export function PasoPasajeros({
  asientos,
  pasajeros,
  yo,
  sugerencias,
  intento,
  focoToken,
  marcados,
  error,
  onEditar,
  onRellenar,
  onEnviar,
  bloqueado,
}: {
  asientos: string[];
  pasajeros: Record<string, DatosPasajero>;
  /** Datos del perfil de quien compra, o null si faltan (no hay atajo "Soy yo"). */
  yo: DatosPasajero | null;
  sugerencias: SugerenciaPasajero[];
  /** Ya se intentó continuar: se muestran los errores. */
  intento: boolean;
  /** Cambia cuando hay que llevar el foco al primer campo con error. */
  focoToken: number;
  /** Asientos que el servidor señaló con datos incompletos. */
  marcados: string[];
  error: string | null;
  onEditar: (asiento: string, campo: keyof DatosPasajero, valor: string) => void;
  onRellenar: (asiento: string, datos: DatosPasajero) => void;
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
      {error && <AvisoError>{error}</AvisoError>}

      {asientos.map((asiento, i) => {
        const p = pasajeros[asiento] ?? PASAJERO_VACIO;
        const errores = erroresPasajero(p);
        const mostrar = intento ? errores : { nombre: null, cedula: null, telefono: null };
        const conError = Boolean(mostrar.nombre || mostrar.cedula || mostrar.telefono) || marcados.includes(asiento);
        // Sugerencias que no están ya puestas en otro asiento.
        const usadas = new Set(asientos.map((a) => pasajeros[a]?.cedula).filter(Boolean));
        const disponibles = sugerencias.filter((g) => !usadas.has(g.cedula) || g.cedula === p.cedula);
        const yoUsado = yo ? asientos.some((a) => a !== asiento && pasajeros[a]?.cedula === yo.cedula) : false;
        const ultimo = i === asientos.length - 1;
        return (
          <TarjetaPasajero key={asiento} asiento={asiento} conError={conError} bloqueado={bloqueado}>
            {(yo || disponibles.length > 0) && (
              <div className={s.sugerencias} role="group" aria-label={`Rellenar los datos del asiento ${asiento}`}>
                {yo && (
                  <button type="button" className={s.chip} disabled={yoUsado} onClick={() => onRellenar(asiento, yo)}>
                    <UserCircleIcon aria-hidden weight="bold" />
                    Soy yo
                  </button>
                )}
                {disponibles.map((g) => (
                  <button
                    key={g.cedula}
                    type="button"
                    className={s.chip}
                    onClick={() => onRellenar(asiento, { nombre: g.nombre, cedula: g.cedula, telefono: g.telefono ?? "" })}
                  >
                    <ClockCounterClockwiseIcon aria-hidden weight="bold" />
                    <span>
                      {g.nombre} <span className="sr-only">, cédula </span>
                      <span aria-hidden>·</span> {formatCedula(g.cedula)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <Campo
              id={idCampo(asiento, "nombre")}
              label="Nombre y apellido"
              placeholder="Ej. María Pérez"
              value={p.nombre}
              onChange={(v) => onEditar(asiento, "nombre", v)}
              error={mostrar.nombre}
              maxLength={120}
              autoComplete="off"
              autoCapitalize="words"
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
  bloqueado,
  children,
}: {
  asiento: string;
  conError: boolean;
  bloqueado: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "gap-5 border-2 border-transparent p-5 py-5 motion-safe:transition-colors",
        conError && "border-destructive-text"
      )}
    >
      <fieldset className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0" disabled={bloqueado}>
        <legend className="mb-4 flex items-center gap-3 p-0">
          <IconTile icon={UserCircleIcon} tone="sky" />
          <span className="text-[17px] font-semibold">Asiento {asiento}</span>
        </legend>
        {children}
      </fieldset>
    </Card>
  );
}
