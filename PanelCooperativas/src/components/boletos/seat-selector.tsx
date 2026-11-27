"use client";

// ─── Mapa de asientos (taquilla) ────────────────────────────────────────────
// Asientos numerados "1".."N" con la misma distribución que la app (shared/asientos.ts):
// copiloto al lado del chofer, puerta adelante a la derecha y fila trasera que puede
// llevar un asiento en el pasillo. El bus lo dibuja `BusAsientos`.
// Permite elegir varios asientos para vender una compra completa.
// Colores D24: libre blanco con borde `border-strong`; ocupado relleno
// `surface-dark` con el número en `muted-foreground`; elegido `accent-strong`.
//
// Es controlado: la página guarda la selección (`seleccion` / `onChange`) y pone la
// acción "Continuar" en su `BarraFlujo`. `ocupados` y su carga los lee la página
// (`useAsientosOcupados`).

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { BusAsientos } from "./bus-asientos";
import { cn } from "@/lib/utils";

/** Asientos guardados con el formato antiguo del panel ("3B") → número ("10"). */
export function asientoNumerico(asiento: string): string {
  const m = /^(\d+)([A-D])$/i.exec(asiento.trim());
  if (!m) return asiento.trim();
  return String((Number(m[1]) - 1) * 4 + "ABCD".indexOf(m[2].toUpperCase()) + 1);
}

/** "14" / "14 y 15" / "3, 14 y 15" */
export function listaAsientos(asientos: string[]): string {
  const orden = [...asientos].sort((a, b) => Number(a) - Number(b));
  if (orden.length <= 1) return orden.join("");
  return `${orden.slice(0, -1).join(", ")} y ${orden[orden.length - 1]}`;
}

const CASILLA = "size-12 md:size-14";

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      <span className="flex items-center gap-2">
        <span className="size-4 rounded-xs border border-border-strong bg-background" aria-hidden />
        Libre
      </span>
      <span className="flex items-center gap-2">
        <span className="size-4 rounded-xs bg-surface-dark" aria-hidden />
        Ocupado
      </span>
      <span className="flex items-center gap-2">
        <span className="size-4 rounded-xs bg-accent-strong" aria-hidden />
        Elegido
      </span>
    </div>
  );
}

interface SeatSelectorProps {
  totalAsientos: number;
  /** Asientos ocupados del viaje; `null` mientras se leen (el mapa queda bloqueado). */
  ocupados: ReadonlySet<string> | null;
  /** Asientos elegidos (controlado). */
  seleccion: string[];
  onChange: (asientos: string[]) => void;
  /** No se pudieron leer los ocupados: aviso + "Reintentar" (sin ellos no se sabe qué está libre). */
  error?: string | null;
  onReintentar?: () => void | Promise<void>;
  /** Máximo de asientos por venta (el servidor acepta hasta 10). */
  maxSeleccion?: number;
  /** Se está cobrando: el mapa queda bloqueado. */
  bloqueado?: boolean;
  /** Quién lo usa: la taquilla "vende"; el pasajero "compra" (solo cambia los textos). */
  modo?: "taquilla" | "pasajero";
}

export function SeatSelector({
  totalAsientos,
  ocupados,
  seleccion,
  onChange,
  error = null,
  onReintentar,
  maxSeleccion = 10,
  bloqueado = false,
  modo = "taquilla",
}: SeatSelectorProps) {
  const [limiteAlcanzado, setLimiteAlcanzado] = useState(false);

  if (error) {
    return (
      <ErrorState
        compacto
        titulo="No pudimos cargar los asientos"
        descripcion={error}
        onReintentar={onReintentar ?? (() => {})}
      />
    );
  }

  if (ocupados === null) {
    return (
      <div className="flex flex-col items-center gap-5" role="status" aria-label="Cargando los asientos">
        <Skeleton className="h-4 w-48" />
        <BusAsientos
          totalAsientos={totalAsientos}
          tamCasilla={CASILLA}
          casilla={(a) => <Skeleton key={a} className={cn(CASILLA, "rounded-sm")} />}
        />
      </div>
    );
  }

  const libres = Math.max(totalAsientos - ocupados.size, 0);

  const alternar = (asiento: string) => {
    if (bloqueado || ocupados.has(asiento)) return;
    if (seleccion.includes(asiento)) {
      setLimiteAlcanzado(false);
      onChange(seleccion.filter((a) => a !== asiento));
      return;
    }
    if (seleccion.length >= maxSeleccion) {
      setLimiteAlcanzado(true);
      return;
    }
    setLimiteAlcanzado(false);
    onChange([...seleccion, asiento].sort((a, b) => Number(a) - Number(b)));
  };

  const casilla = (asiento: string) => {
    const ocupado = ocupados.has(asiento);
    const elegido = seleccion.includes(asiento);
    return (
      <button
        key={asiento}
        type="button"
        disabled={ocupado || bloqueado}
        aria-pressed={elegido}
        aria-label={`Asiento ${asiento}, ${ocupado ? "ocupado" : elegido ? "elegido" : "libre"}`}
        onClick={() => alternar(asiento)}
        className={cn(
          CASILLA,
          "relative flex items-center justify-center rounded-sm border text-[15px] font-semibold tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          ocupado && "cursor-not-allowed border-transparent bg-surface-dark text-muted-foreground",
          !ocupado && !elegido && "border-border-strong bg-background text-foreground hover:bg-muted",
          !ocupado && !elegido && bloqueado && "cursor-not-allowed opacity-50 hover:bg-background",
          elegido && "border-accent-strong bg-accent-strong text-accent-strong-foreground shadow-sun"
        )}
      >
        {asiento}
        {/* Respaldo: queda detrás de quien mira al frente del bus. */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-current",
            elegido ? "opacity-50" : "opacity-20"
          )}
        />
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-2 text-[13px] text-muted-foreground">
        <Leyenda />
        <p className="tabular-nums">
          {libres} libres de {totalAsientos} · máx. {maxSeleccion} {modo === "pasajero" ? "por compra" : "por venta"}
        </p>
      </div>

      {limiteAlcanzado && (
        <p
          role="alert"
          className="w-full max-w-sm rounded-md bg-warning-light px-4 py-3 text-[13px] text-warning-text"
        >
          {modo === "pasajero"
            ? `Puedes elegir hasta ${maxSeleccion} asientos por compra.`
            : `Puedes vender hasta ${maxSeleccion} asientos por compra.`}
        </p>
      )}

      <BusAsientos totalAsientos={totalAsientos} tamCasilla={CASILLA} casilla={casilla} />
    </div>
  );
}
