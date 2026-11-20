"use client";

// ─── Paso 1: Elige la salida ─────────────────────────────────────────────────
// Filtros (día de salida en el servidor y ruta; se combinan) y la lista de salidas
// como grupo de opciones: tocar marca la salida, "Continuar" (en la barra de la
// página) avanza.

import { useId } from "react";
import { ArrowRightIcon, CalendarBlankIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { GrupoOpciones } from "@/components/opcion-tile";
import { hoyVE } from "@/lib/fechas";
import { SelectorDia, diaEnFrase, nombreDia } from "../selector-dia";
import { ViajeOpcion } from "../viaje-opcion";
import { LIMITE_VIAJES_DIA, TODAS_LAS_RUTAS, type Salidas } from "./use-salidas";

export function PasoSalida({
  salidas,
  marcado,
  onMarcar,
}: {
  salidas: Salidas;
  marcado: string | null;
  onMarcar: (id: string) => void;
}) {
  const ids = useId();
  const { viajes, cargando, error, hayMas, dia, cambiarDia, proximoDia, rutas, filtroRuta, setFiltroRuta, hayFiltroRuta } =
    salidas;

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros: día de salida (en el servidor) y ruta; se combinan. */}
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
        <SelectorDia dia={dia} onCambio={cambiarDia} disabled={dia === null} />
        <div className="flex w-full flex-col gap-2 md:w-64">
          <Label htmlFor={`${ids}-ruta`}>Ruta</Label>
          <Select
            value={filtroRuta}
            onValueChange={(val) => setFiltroRuta(val ?? TODAS_LAS_RUTAS)}
            items={{
              [TODAS_LAS_RUTAS]: "Todas las rutas",
              ...Object.fromEntries(rutas.map((r) => [r.etiqueta, r.etiqueta])),
            }}
          >
            <SelectTrigger id={`${ids}-ruta`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS_LAS_RUTAS}>Todas las rutas</SelectItem>
              {rutas.map((r) => (
                <SelectItem key={r.etiqueta} value={r.etiqueta}>
                  {r.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {cargando ? (
        <div className="grid gap-2" role="status" aria-label="Cargando los viajes">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-md" />
          ))}
        </div>
      ) : error ? (
        <ErrorState compacto titulo="No pudimos cargar los viajes" descripcion={error} onReintentar={salidas.recargar} />
      ) : viajes.length === 0 ? (
        <EmptyState
          compacto
          icon={CalendarBlankIcon}
          title={
            dia === hoyVE()
              ? `No quedan salidas a la venta hoy${hayFiltroRuta ? " en esta ruta" : ""}`
              : `No hay salidas ${diaEnFrase(dia ?? hoyVE())}${hayFiltroRuta ? " en esta ruta" : ""}`
          }
          description={
            proximoDia
              ? `La próxima salida es ${diaEnFrase(proximoDia)}.`
              : hayFiltroRuta
                ? "No hay más salidas programadas en esta ruta. Prueba con otra."
                : "Programa las salidas en Viajes."
          }
          action={
            proximoDia && (
              <Button variant="outline" size="lg" onClick={() => cambiarDia(proximoDia)}>
                Ver {diaEnFrase(proximoDia)}
                <ArrowRightIcon aria-hidden />
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-muted-foreground" aria-live="polite">
            <span className="font-medium text-foreground">{nombreDia(dia ?? hoyVE())}</span>
            {" · "}
            {viajes.length === 1 ? "1 salida" : `${viajes.length} salidas`}
            {hayMas && ` (las primeras ${LIMITE_VIAJES_DIA}: filtra por ruta para ver otras)`}
          </p>
          <GrupoOpciones etiqueta="Salidas" className="grid gap-2">
            {viajes.map((viaje) => (
              <ViajeOpcion
                key={viaje.id}
                viaje={viaje}
                seleccionado={marcado === viaje.id}
                onSelect={() => onMarcar(viaje.id)}
              />
            ))}
          </GrupoOpciones>
        </div>
      )}
    </div>
  );
}
