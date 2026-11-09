"use client";

// ─── Tarjeta de un viaje a la venta (taquilla) ──────────────────────────────
// Pensada para leer de un vistazo con cola: primero la hora de salida y la ruta,
// luego los asientos libres (en ámbar si quedan pocos), el precio y, en
// segundo plano, la unidad y el chofer. Es un `role="radio"`: va dentro de
// `GrupoOpciones`, que reparte el foco y mueve la selección con las flechas.
// Elegida = indicador relleno, borde y anillo `accent-strong` y fondo
// `accent-light` (el color nunca es la única señal, D1).

import { ArrowRight, Bus, CheckCircle, Circle, Clock, MapPin, Seat, SteeringWheel, Tag } from "@phosphor-icons/react";
import { Monto } from "@/components/monto";
import { TonoBadge } from "@/components/status-badge";
import { formatCiudad } from "@/lib/ciudades";
import { formatHoraVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/** Con esta cantidad de asientos libres o menos, se avisa en ámbar. */
export const POCOS_ASIENTOS = 5;

export type DatosViajeOpcion = {
  fecha_hora_salida: string;
  asientos_totales: number;
  asientos_disponibles: number;
  numero_unidad: string | null;
  nombre_chofer?: string | null;
  ruta: { ciudad_origen: string; ciudad_destino: string; precio_pasaje: number };
};

export function ViajeOpcion({
  viaje,
  seleccionado,
  onSelect,
}: {
  viaje: DatosViajeOpcion;
  seleccionado: boolean;
  onSelect(): void;
}) {
  const libres = viaje.asientos_disponibles;
  const agotado = libres <= 0;
  const pocos = !agotado && libres <= POCOS_ASIENTOS;
  const precio = Number(viaje.ruta.precio_pasaje);
  const sinPrecio = !(precio > 0);
  const disabled = agotado || sinPrecio;
  const origen = formatCiudad(viaje.ruta.ciudad_origen);
  const destino = formatCiudad(viaje.ruta.ciudad_destino);
  const hora = formatHoraVE(viaje.fecha_hora_salida);
  const Indicador = seleccionado ? CheckCircle : Circle;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionado}
      disabled={disabled}
      onClick={() => {
        if (!seleccionado) onSelect();
      }}
      className={cn(
        "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-md border border-border bg-card p-4 text-left text-foreground transition-colors outline-none",
        "sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4",
        "hover:border-input-border hover:bg-muted/50",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card",
        seleccionado &&
          "border-accent-strong bg-accent-light ring-2 ring-accent-strong hover:border-accent-strong hover:bg-accent-light"
      )}
    >
      {/* Indicador de selección (forma de radio: vacío / relleno con check). */}
      <Indicador
        weight={seleccionado ? "fill" : "regular"}
        className={cn("row-span-2 mt-1 size-6 shrink-0", seleccionado ? "text-accent-strong" : "text-border-strong")}
        aria-hidden
      />

      {/* Hora y ruta: lo primero que se lee. */}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <Clock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Sale a las </span>
          <span className="text-xl leading-tight font-semibold tabular-nums">{hora}</span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-base leading-snug font-semibold">
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>{origen}</span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only"> a </span>
          <span>{destino}</span>
        </span>
      </span>

      {/* Asientos y precio: a la derecha en escritorio, debajo en móvil. */}
      <span className="col-start-2 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:col-start-3 sm:row-start-1 sm:row-span-2 sm:flex-col sm:items-end sm:justify-start">
        {agotado ? (
          <TonoBadge tono="peligro">Agotado</TonoBadge>
        ) : (
          <span
            className={cn(
              "flex items-center gap-1.5 text-sm font-semibold tabular-nums",
              pocos ? "text-warning-text" : "text-foreground"
            )}
          >
            <Seat className="size-4 shrink-0" weight={pocos ? "fill" : "regular"} aria-hidden />
            {pocos ? `Quedan ${libres}` : `${libres} libres`}
            <span className="font-normal text-muted-foreground">de {viaje.asientos_totales}</span>
          </span>
        )}
        {sinPrecio ? (
          <TonoBadge tono="peligro">Sin precio</TonoBadge>
        ) : (
          <span className="flex items-start gap-1.5">
            <Tag className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Monto usd={precio} size="md" align="right" className="text-foreground" />
          </span>
        )}
      </span>

      {/* Unidad y chofer: secundarios. */}
      {(viaje.numero_unidad || viaje.nombre_chofer) && (
        <span className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {viaje.numero_unidad && (
            <span className="flex items-center gap-1.5">
              <Bus className="size-4 shrink-0" aria-hidden />
              Unidad {viaje.numero_unidad}
            </span>
          )}
          {viaje.nombre_chofer && (
            <span className="flex min-w-0 items-center gap-1.5">
              <SteeringWheel className="size-4 shrink-0" aria-hidden />
              <span className="sr-only">Chofer </span>
              <span className="truncate">{viaje.nombre_chofer}</span>
            </span>
          )}
        </span>
      )}
    </button>
  );
}
