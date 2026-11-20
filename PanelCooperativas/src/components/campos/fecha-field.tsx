"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatFechaCalendario, hoyVE, sumarDiasVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { Calendario, esFechaISO } from "./calendario";
import { CampoContenedor, idsCampo, type PropsCampoComun } from "./campo-base";
import { CLASE_BOTON_CAMPO, CLASE_BOTON_CAMPO_VACIO, SuperficieCampo } from "./superficie-campo";

export interface FechaFieldProps extends Omit<PropsCampoComun, "enterKeyHint" | "autoFocus"> {
  /** 'YYYY-MM-DD' (día de calendario en hora de Venezuela) o "". */
  value: string;
  onChange(fecha: string): void;
  /** Primer día elegible ('YYYY-MM-DD'). */
  min?: string;
  /** Último día elegible ('YYYY-MM-DD'), p. ej. `hoyVE()` para la fecha de un pago. */
  max?: string;
  /** Días con un punto (p. ej. los que tienen salidas). */
  diasActivos?: readonly string[];
  /** Con `diasActivos`: solo se pueden elegir esos días (por defecto sí; `false` solo los marca). */
  soloDiasActivos?: boolean;
  /** Texto de los días con punto: "con salidas" (por defecto, "día disponible"). */
  leyendaActivos?: string;
  /** Atajos "Hoy" y "Mañana" (por defecto sí; solo aparecen los que se pueden elegir). */
  atajos?: boolean;
  /** "Elige la fecha" por defecto. */
  placeholder?: string;
  /** Título de la hoja en móvil (por defecto, la etiqueta). */
  titulo?: string;
}

/**
 * Fecha con calendario propio (nada de `<input type="date">`): popover en escritorio, hoja
 * inferior en móvil. Guarda 'YYYY-MM-DD'. Teclado completo en la cuadrícula (flechas, Inicio/Fin,
 * RePág/AvPág). Con `opcional`, ofrece "Quitar fecha".
 */
export function FechaField({
  id,
  label,
  value,
  onChange,
  error,
  ayuda,
  opcional,
  disabled,
  name,
  required,
  className,
  min,
  max,
  diasActivos,
  soloDiasActivos = true,
  leyendaActivos = diasActivos ? "día disponible" : "",
  atajos = true,
  placeholder = "Elige la fecha",
  titulo,
}: FechaFieldProps) {
  const [abierto, setAbierto] = useState(false);
  const refFoco = useRef<HTMLButtonElement | null>(null);
  const { describedBy, invalido } = idsCampo(id, error, ayuda);
  const activos = useMemo(() => (diasActivos ? new Set(diasActivos) : undefined), [diasActivos]);

  const hoy = hoyVE();
  const manana = sumarDiasVE(hoy, 1);
  const valida = esFechaISO(value);

  const elegible = (f: string) =>
    !(min && f < min) && !(max && f > max) && !(soloDiasActivos && activos && !activos.has(f));

  const elegir = (f: string) => {
    onChange(f);
    setAbierto(false);
  };

  const sufijoRelativo = valida ? (value === hoy ? "Hoy" : value === manana ? "Mañana" : null) : null;

  return (
    <CampoContenedor
      id={id}
      label={label}
      opcional={opcional}
      error={error}
      ayuda={ayuda}
      disabled={disabled}
      className={className}
      ocultos={name ? <input type="hidden" name={name} value={value} /> : undefined}
    >
      <SuperficieCampo
        abierto={abierto}
        onAbiertoChange={setAbierto}
        titulo={titulo ?? label}
        focoInicial={refFoco}
        disparador={
          // aria-invalid / aria-required en el botón: lo leen los lectores de pantalla y el estilo depende de él.
          // eslint-disable-next-line jsx-a11y/role-supports-aria-props
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-invalid={invalido}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            className={cn(CLASE_BOTON_CAMPO, !valida && CLASE_BOTON_CAMPO_VACIO)}
          >
            <span className={cn("min-w-0 flex-1 truncate tabular-nums", !valida && "font-normal")}>
              {valida ? formatFechaCalendario(value) : placeholder}
              {sufijoRelativo && <span className="font-normal text-muted-foreground"> · {sufijoRelativo}</span>}
            </span>
            <CalendarBlankIcon aria-hidden className="size-5 text-muted-foreground" />
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {atajos && (elegible(hoy) || elegible(manana)) && (
            <div className="flex flex-wrap gap-2">
              {elegible(hoy) && (
                <Button type="button" variant={value === hoy ? "default" : "secondary"} size="sm" onClick={() => elegir(hoy)}>
                  Hoy
                </Button>
              )}
              {elegible(manana) && (
                <Button
                  type="button"
                  variant={value === manana ? "default" : "secondary"}
                  size="sm"
                  onClick={() => elegir(manana)}
                >
                  Mañana
                </Button>
              )}
            </div>
          )}
          <Calendario
            id={`${id}-calendario`}
            value={valida ? value : ""}
            hoy={hoy}
            min={min}
            max={max}
            diasActivos={activos}
            soloActivos={soloDiasActivos}
            leyendaActivos={leyendaActivos || "día disponible"}
            onElegir={elegir}
            refFoco={refFoco}
          />
          {opcional && valida && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => elegir("")}
            >
              Quitar fecha
            </Button>
          )}
        </div>
      </SuperficieCampo>
    </CampoContenedor>
  );
}
